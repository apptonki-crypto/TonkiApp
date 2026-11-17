import prisma from "src/lib/db";
import { getDynamicChain } from "src/lib/posts/chain";
import { getSignerBudget } from "src/lib/posts/chain/budget";
import { ChainConfigError, readChainMode } from "src/lib/posts/chain/config";
import { CHAIN_HANDLERS } from "src/lib/posts/chain/handlers";
import {
  claimDueJobs,
  enqueueChainJob,
  markJobDone,
  markJobFailed,
  type ClaimedJob,
} from "src/lib/posts/chain/jobs";
import { reconcileActiveDynamics } from "src/lib/posts/chain/reconcile";
import { ChainTransactionError, type DynamicChain } from "src/lib/posts/chain/types";

const DEFAULT_BATCH = 10;
/** Time after `ends_at` before asking the contract to expire, to absorb ledger clock skew. */
const EXPIRY_GRACE_MS = 30_000;
const EVALUATE_BUCKET_MS = 10 * 60 * 1000;
const BUMP_INTERVAL_MS = 10 * 24 * 60 * 60 * 1000;

export type ProcessedJob = {
  job_id: string;
  type: ClaimedJob["type"];
  dynamic_id: string;
  result: "done" | "retry" | "failed";
  error?: string;
};

export type WorkerReport = {
  mode: ReturnType<typeof readChainMode>;
  processed: ProcessedJob[];
  enqueued: { evaluate: number; bump: number };
  reconciled?: Awaited<ReturnType<typeof reconcileActiveDynamics>>;
  balance?: { balanceXlm: number; minBalanceXlm: number; ok: boolean } | { error: string };
};

function errorInfo(error: unknown): { message: string; retryable: boolean; txHash?: string } {
  if (error instanceof ChainTransactionError) {
    return { message: error.message, retryable: error.retryable, txHash: error.txHash };
  }
  if (error instanceof ChainConfigError) {
    // Needs an operator; requeue after fixing the environment.
    return { message: error.message, retryable: false };
  }
  return {
    message: error instanceof Error ? error.message : String(error),
    retryable: true,
  };
}

export async function runChainJob(
  job: ClaimedJob,
  chain: DynamicChain,
  now: Date
): Promise<ProcessedJob> {
  const base = { job_id: job.job_id, type: job.type, dynamic_id: job.dynamic_id };
  try {
    const done = await CHAIN_HANDLERS[job.type](job, { chain, now });
    await markJobDone(job.job_id, done);
    return { ...base, result: "done" };
  } catch (error) {
    const info = errorInfo(error);
    const outcome = await markJobFailed(job, info, now);
    if (outcome === "failed" && job.type === "deploy") {
      // The author sees "falló la activación" and an operator can requeue the job.
      await prisma.postDynamic.updateMany({
        where: { dynamic_id: job.dynamic_id, chain_status: "pending" },
        data: { chain_status: "failed" },
      });
    }
    return { ...base, result: outcome, error: info.message };
  }
}

/** Processes due jobs one by one: a single signer cannot submit in parallel anyway. */
export async function processChainJobs(
  options: { limit?: number; now?: Date; chain?: DynamicChain } = {}
): Promise<ProcessedJob[]> {
  if (readChainMode() === "off") return [];
  const now = options.now ?? new Date();
  const chain = options.chain ?? getDynamicChain();
  const claimed = await claimDueJobs(options.limit ?? DEFAULT_BATCH, now);
  const processed: ProcessedJob[] = [];
  for (const job of claimed) {
    processed.push(await runChainJob(job, chain, now));
  }
  return processed;
}

/**
 * Closing needs a signature, so it cannot happen while reading the feed. Dynamics whose
 * time ran out are sent to the contract; goal-based closes already happened in the
 * participation transaction and are copied back by the sync.
 */
export async function enqueueEvaluateJobs(now: Date = new Date()): Promise<number> {
  const due = await prisma.postDynamic.findMany({
    where: {
      chain_status: "active",
      status: "active",
      contract_id: { not: null },
      ends_at: { lt: new Date(now.getTime() - EXPIRY_GRACE_MS) },
    },
    select: { dynamic_id: true, contract_id: true },
    take: 200,
  });
  const bucket = Math.floor(now.getTime() / EVALUATE_BUCKET_MS);
  for (const row of due) {
    await enqueueChainJob(prisma, {
      dynamicId: row.dynamic_id,
      type: "evaluate",
      dedupeKey: `eval:${bucket}`,
      contractId: row.contract_id,
    });
  }
  return due.length;
}

/** Keeps long-running contracts alive; each write also extends the TTL. */
export async function enqueueBumpJobs(now: Date = new Date()): Promise<number> {
  const live = await prisma.postDynamic.findMany({
    where: { chain_status: "active", status: "active", contract_id: { not: null } },
    select: { dynamic_id: true, contract_id: true },
    take: 500,
  });
  const bucket = Math.floor(now.getTime() / BUMP_INTERVAL_MS);
  for (const row of live) {
    await enqueueChainJob(prisma, {
      dynamicId: row.dynamic_id,
      type: "bump",
      dedupeKey: `bump:${bucket}`,
      contractId: row.contract_id,
    });
  }
  return live.length;
}

/** One cron tick: maintenance, then jobs, then the comparison. */
export async function runChainWorker(
  options: {
    limit?: number;
    now?: Date;
    chain?: DynamicChain;
    reconcile?: boolean;
  } = {}
): Promise<WorkerReport> {
  const mode = readChainMode();
  const report: WorkerReport = {
    mode,
    processed: [],
    enqueued: { evaluate: 0, bump: 0 },
  };
  if (mode === "off") return report;

  const now = options.now ?? new Date();
  report.enqueued.evaluate = await enqueueEvaluateJobs(now);
  report.enqueued.bump = await enqueueBumpJobs(now);
  report.processed = await processChainJobs({ ...options, now });

  if (options.reconcile) {
    report.reconciled = await reconcileActiveDynamics({ chain: options.chain });
  }

  try {
    const budget = await getSignerBudget(now, { force: true });
    report.balance = {
      balanceXlm: budget.balanceXlm,
      minBalanceXlm: budget.minBalanceXlm,
      ok: budget.ok,
    };
    if (!budget.ok) {
      console.error(
        `[dynamics-chain] saldo bajo del firmante: ${budget.balanceXlm} XLM (mínimo ${budget.minBalanceXlm})`
      );
    }
  } catch (error) {
    report.balance = {
      error: error instanceof Error ? error.message : String(error),
    };
  }
  return report;
}
