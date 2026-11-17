import prisma from "src/lib/db";
import {
  isChainKindEnabled,
  readChainMode,
  type ChainMode,
} from "src/lib/posts/chain/config";
import { CHAIN_JOB_TYPES, type ChainJobType } from "src/lib/posts/chain/jobs";
import { DYNAMIC_KINDS } from "src/lib/posts/dynamics/constants";

const STROOPS_PER_XLM = BigInt(10_000_000);

export type CostByType = {
  type: ChainJobType;
  done: number;
  pending: number;
  failed: number;
  /** Fee paid, in stroops. */
  fee_stroops: string;
  fee_xlm: number;
  /** Average over the jobs that reported a fee. */
  avg_fee_xlm: number | null;
};

export type ChainCostReport = {
  mode: ChainMode;
  enabled_kinds: string[];
  window_days: number;
  since: string;
  total_fee_stroops: string;
  total_fee_xlm: number;
  by_type: CostByType[];
  dynamics: Record<string, number>;
  /** Jobs that gave up: they need an operator (`retryFailed=1`). */
  failed_jobs: number;
  /** Oldest job still waiting, to spot a stalled worker. */
  oldest_pending_at: string | null;
};

export function stroopsToXlm(stroops: bigint): number {
  const whole = stroops / STROOPS_PER_XLM;
  const rest = stroops % STROOPS_PER_XLM;
  return Number(whole) + Number(rest) / Number(STROOPS_PER_XLM);
}

/**
 * What the integration cost over a window and how healthy the queue is. Meant to answer
 * two questions before moving a kind from shadow to on: how much XLM per action, and
 * whether the worker keeps up.
 */
export async function getChainCostReport(
  options: { days?: number; now?: Date } = {}
): Promise<ChainCostReport> {
  const now = options.now ?? new Date();
  const days = Math.min(Math.max(Math.trunc(options.days ?? 30), 1), 365);
  const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  const [grouped, dynamicGroups, failedJobs, oldestPending] = await Promise.all([
    prisma.dynamicChainJob.groupBy({
      by: ["type", "status"],
      where: { created_at: { gte: since } },
      _count: { _all: true },
      _sum: { fee_stroops: true },
    }),
    prisma.postDynamic.groupBy({
      by: ["chain_status"],
      _count: { _all: true },
    }),
    prisma.dynamicChainJob.count({ where: { status: "failed" } }),
    prisma.dynamicChainJob.findFirst({
      where: { status: "pending" },
      orderBy: { created_at: "asc" },
      select: { created_at: true },
    }),
  ]);

  const byType = CHAIN_JOB_TYPES.map((type): CostByType => {
    const rows = grouped.filter((row) => row.type === type);
    const count = (status: string) =>
      rows
        .filter((row) => row.status === status)
        .reduce((sum, row) => sum + row._count._all, 0);
    const fee = rows.reduce(
      (sum, row) => sum + (row._sum.fee_stroops ?? BigInt(0)),
      BigInt(0)
    );
    const done = count("done");
    return {
      type,
      done,
      pending: count("pending") + count("processing"),
      failed: count("failed"),
      fee_stroops: fee.toString(),
      fee_xlm: stroopsToXlm(fee),
      avg_fee_xlm: done > 0 ? stroopsToXlm(fee) / done : null,
    };
  });

  const total = byType.reduce((sum, row) => sum + BigInt(row.fee_stroops), BigInt(0));
  const dynamics: Record<string, number> = {};
  for (const row of dynamicGroups) dynamics[row.chain_status] = row._count._all;

  return {
    mode: readChainMode(),
    enabled_kinds: DYNAMIC_KINDS.filter((kind) => isChainKindEnabled(kind)),
    window_days: days,
    since: since.toISOString(),
    total_fee_stroops: total.toString(),
    total_fee_xlm: stroopsToXlm(total),
    by_type: byType,
    dynamics,
    failed_jobs: failedJobs,
    oldest_pending_at: oldestPending?.created_at.toISOString() ?? null,
  };
}
