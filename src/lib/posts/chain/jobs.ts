import { Prisma } from "src/generated/prisma/client";

import prisma from "src/lib/db";

export const CHAIN_JOB_TYPES = [
  "deploy",
  "participation",
  "consume",
  "close",
  "evaluate",
  "bump",
] as const;

export type ChainJobType = (typeof CHAIN_JOB_TYPES)[number];

export const MAX_JOB_ATTEMPTS = 8;
/** A worker that died mid-job releases it after this long. */
export const JOB_LOCK_TIMEOUT_MS = 5 * 60 * 1000;
const BACKOFF_BASE_MS = 15_000;
const BACKOFF_MAX_MS = 30 * 60 * 1000;

type Client = Prisma.TransactionClient | typeof prisma;

export type EnqueueInput = {
  dynamicId: string;
  type: ChainJobType;
  /** Identifies the work. Enqueueing the same key twice is a no-op. */
  dedupeKey: string;
  contractId?: string | null;
  payload?: Prisma.InputJsonObject;
  runAt?: Date;
};

/**
 * Outbox write. Pass the transaction that changes the database so the job exists
 * if and only if that change commits.
 */
export async function enqueueChainJob(
  client: Client,
  input: EnqueueInput
): Promise<void> {
  await client.dynamicChainJob.upsert({
    where: {
      dynamic_id_type_dedupe_key: {
        dynamic_id: input.dynamicId,
        type: input.type,
        dedupe_key: input.dedupeKey,
      },
    },
    create: {
      dynamic_id: input.dynamicId,
      type: input.type,
      dedupe_key: input.dedupeKey.slice(0, 80),
      contract_id: input.contractId ?? null,
      payload: input.payload ?? Prisma.JsonNull,
      next_attempt_at: input.runAt ?? new Date(),
    },
    update: {},
  });
}

export function backoffMs(attempts: number): number {
  const exp = BACKOFF_BASE_MS * 2 ** Math.max(0, attempts - 1);
  return Math.min(exp, BACKOFF_MAX_MS);
}

export type ClaimedJob = {
  job_id: string;
  dynamic_id: string;
  contract_id: string | null;
  type: ChainJobType;
  dedupe_key: string;
  payload: unknown;
  attempts: number;
};

function isJobType(value: string): value is ChainJobType {
  return (CHAIN_JOB_TYPES as readonly string[]).includes(value);
}

/** Claims up to `limit` due jobs, oldest first. Each claim is an atomic status flip. */
export async function claimDueJobs(
  limit: number,
  now: Date = new Date()
): Promise<ClaimedJob[]> {
  const staleBefore = new Date(now.getTime() - JOB_LOCK_TIMEOUT_MS);
  await prisma.dynamicChainJob.updateMany({
    where: { status: "processing", locked_at: { lt: staleBefore } },
    data: { status: "pending", locked_at: null },
  });

  const candidates = await prisma.dynamicChainJob.findMany({
    where: { status: "pending", next_attempt_at: { lte: now } },
    orderBy: [{ created_at: "asc" }, { job_id: "asc" }],
    take: limit,
    select: { job_id: true },
  });

  const claimed: ClaimedJob[] = [];
  for (const candidate of candidates) {
    const won = await prisma.dynamicChainJob.updateMany({
      where: { job_id: candidate.job_id, status: "pending" },
      data: { status: "processing", locked_at: now, attempts: { increment: 1 } },
    });
    if (won.count !== 1) continue;
    const row = await prisma.dynamicChainJob.findUnique({
      where: { job_id: candidate.job_id },
    });
    if (!row || !isJobType(row.type)) continue;
    claimed.push({
      job_id: row.job_id,
      dynamic_id: row.dynamic_id,
      contract_id: row.contract_id,
      type: row.type,
      dedupe_key: row.dedupe_key,
      payload: row.payload,
      attempts: row.attempts,
    });
  }
  return claimed;
}

export type JobDone = {
  txHash?: string | null;
  feeStroops?: bigint | null;
  note?: string | null;
};

export async function markJobDone(jobId: string, done: JobDone = {}): Promise<void> {
  await prisma.dynamicChainJob.update({
    where: { job_id: jobId },
    data: {
      status: "done",
      locked_at: null,
      tx_hash: done.txHash || null,
      fee_stroops: done.feeStroops ?? null,
      last_error: done.note ? done.note.slice(0, 500) : null,
    },
  });
}

export async function markJobFailed(
  job: Pick<ClaimedJob, "job_id" | "attempts">,
  error: { message: string; retryable: boolean; txHash?: string },
  now: Date = new Date()
): Promise<"retry" | "failed"> {
  const exhausted = job.attempts >= MAX_JOB_ATTEMPTS;
  const giveUp = !error.retryable || exhausted;
  await prisma.dynamicChainJob.update({
    where: { job_id: job.job_id },
    data: {
      status: giveUp ? "failed" : "pending",
      locked_at: null,
      last_error: error.message.slice(0, 500),
      tx_hash: error.txHash ?? undefined,
      next_attempt_at: giveUp
        ? undefined
        : new Date(now.getTime() + backoffMs(job.attempts)),
    },
  });
  return giveUp ? "failed" : "retry";
}

/** Failed jobs go back to the queue (operator action after fixing the cause). */
export async function requeueFailedJobs(
  filter: { type?: ChainJobType; dynamicId?: string } = {},
  now: Date = new Date()
): Promise<number> {
  const result = await prisma.dynamicChainJob.updateMany({
    where: {
      status: "failed",
      ...(filter.type ? { type: filter.type } : {}),
      ...(filter.dynamicId ? { dynamic_id: filter.dynamicId } : {}),
    },
    data: {
      status: "pending",
      attempts: 0,
      locked_at: null,
      next_attempt_at: now,
    },
  });
  return result.count;
}
