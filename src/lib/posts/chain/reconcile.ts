import prisma from "src/lib/db";
import { getDynamicChain } from "src/lib/posts/chain";
import { syncMirrorFromChain, type MirrorDiff } from "src/lib/posts/chain/mirror";
import type { DynamicChain } from "src/lib/posts/chain/types";

export type ReconcileEntry = {
  dynamic_id: string;
  contract_id: string;
  /** True when the database was rewritten from the contract. */
  corrected: boolean;
  diffs: MirrorDiff[];
  error?: string;
};

export type ReconcileReport = {
  checked: number;
  divergent: number;
  corrected: number;
  errors: number;
  entries: ReconcileEntry[];
};

/**
 * Compares every live contract with its database row. In `on` mode the contract wins
 * and the row is corrected; in `shadow` mode the differences are only reported, which is
 * the evidence needed before turning `on`.
 *
 * Pending participation/consume jobs make a short-lived difference normal, so callers
 * should expect noise right after a burst of traffic.
 */
export async function reconcileActiveDynamics(
  options: { chain?: DynamicChain; limit?: number; includeClosed?: boolean } = {}
): Promise<ReconcileReport> {
  const chain = options.chain ?? getDynamicChain();
  const rows = await prisma.postDynamic.findMany({
    where: {
      chain_status: "active",
      contract_id: { not: null },
      ...(options.includeClosed ? {} : { status: "active" }),
    },
    orderBy: { updated_at: "asc" },
    take: options.limit ?? 100,
    select: { dynamic_id: true, contract_id: true },
  });

  const report: ReconcileReport = {
    checked: 0,
    divergent: 0,
    corrected: 0,
    errors: 0,
    entries: [],
  };

  for (const row of rows) {
    if (!row.contract_id) continue;
    try {
      const result = await syncMirrorFromChain(row.dynamic_id, {
        chain,
        expectedContractId: row.contract_id,
      });
      if (!result.synced) continue;
      report.checked += 1;
      if (result.diffs.length > 0) {
        report.divergent += 1;
        if (result.wrote) report.corrected += 1;
        report.entries.push({
          dynamic_id: row.dynamic_id,
          contract_id: row.contract_id,
          corrected: result.wrote,
          diffs: result.diffs,
        });
      }
    } catch (error) {
      report.errors += 1;
      report.entries.push({
        dynamic_id: row.dynamic_id,
        contract_id: row.contract_id,
        corrected: false,
        diffs: [],
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return report;
}
