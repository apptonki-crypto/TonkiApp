import { Prisma } from "src/generated/prisma/client";

import prisma from "src/lib/db";
import { isChainAuthoritative } from "src/lib/posts/chain/authority";
import { getDynamicChain } from "src/lib/posts/chain";
import { fromCentavos, toCentavos } from "src/lib/posts/chain/hashes";
import type { ChainState, DynamicChain } from "src/lib/posts/chain/types";

export type MirrorDiff = {
  field: "status" | "progress_count" | "progress_amount";
  database: string;
  chain: string;
};

export type MirrorSyncResult =
  | { synced: false; reason: "no_dynamic" | "no_contract" | "contract_changed" }
  | {
      synced: true;
      /** The database was rewritten from the contract (authoritative mode). */
      wrote: boolean;
      diffs: MirrorDiff[];
      state: ChainState;
    };

type MirrorRow = {
  dynamic_id: string;
  kind: string;
  status: string;
  progress_count: number;
  progress_amount: Prisma.Decimal;
  closed_at: Date | null;
  chain_status: string;
  contract_id: string | null;
};

export function diffMirror(row: MirrorRow, state: ChainState): MirrorDiff[] {
  const diffs: MirrorDiff[] = [];
  if (row.status !== state.status) {
    diffs.push({ field: "status", database: row.status, chain: state.status });
  }
  if (row.progress_count !== state.progressCount) {
    diffs.push({
      field: "progress_count",
      database: String(row.progress_count),
      chain: String(state.progressCount),
    });
  }
  const dbCents = toCentavos(row.progress_amount);
  if (dbCents !== state.progressAmount) {
    diffs.push({
      field: "progress_amount",
      database: dbCents.toString(),
      chain: state.progressAmount.toString(),
    });
  }
  return diffs;
}

/**
 * Reads the contract and compares it with the database row. When the contract is
 * authoritative the row is corrected; in shadow mode the differences are only reported.
 *
 * `expectedContractId` guards against an edit that replaced the contract meanwhile.
 */
export async function syncMirrorFromChain(
  dynamicId: string,
  options: {
    chain?: DynamicChain;
    expectedContractId?: string | null;
    forceWrite?: boolean;
  } = {}
): Promise<MirrorSyncResult> {
  const row = await prisma.postDynamic.findUnique({
    where: { dynamic_id: dynamicId },
    select: {
      dynamic_id: true,
      kind: true,
      status: true,
      progress_count: true,
      progress_amount: true,
      closed_at: true,
      chain_status: true,
      contract_id: true,
    },
  });
  if (!row) return { synced: false, reason: "no_dynamic" };
  if (!row.contract_id) return { synced: false, reason: "no_contract" };
  if (options.expectedContractId && options.expectedContractId !== row.contract_id) {
    return { synced: false, reason: "contract_changed" };
  }

  const chain = options.chain ?? getDynamicChain();
  const state = await chain.readState(row.contract_id);
  const diffs = diffMirror(row, state);

  const authoritative = options.forceWrite || isChainAuthoritative(row);
  let wrote = false;
  if (authoritative && diffs.length > 0) {
    const closedAt =
      state.closedAt > BigInt(0) ? new Date(Number(state.closedAt) * 1000) : null;
    const result = await prisma.postDynamic.updateMany({
      where: { dynamic_id: row.dynamic_id, contract_id: row.contract_id },
      data: {
        status: state.status,
        progress_count: state.progressCount,
        progress_amount: fromCentavos(state.progressAmount),
        closed_at: closedAt,
      },
    });
    wrote = result.count === 1;
  }

  let ledger: number | null = null;
  try {
    ledger = await chain.latestLedger();
  } catch {
    ledger = null;
  }
  if (ledger != null) {
    await prisma.postDynamic.updateMany({
      where: { dynamic_id: row.dynamic_id, contract_id: row.contract_id },
      data: { last_synced_ledger: ledger },
    });
  }

  return { synced: true, wrote, diffs, state };
}
