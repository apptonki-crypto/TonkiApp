import prisma from "src/lib/db";
import { getDynamicChain } from "src/lib/posts/chain";
import { isChainKindEnabled, readChainConfig, readChainMode } from "src/lib/posts/chain/config";
import {
  configHash,
  toCentavos,
  type DynamicChainSource,
} from "src/lib/posts/chain/hashes";
import { syncMirrorFromChain } from "src/lib/posts/chain/mirror";
import type { DynamicChain } from "src/lib/posts/chain/types";
import { isDynamicKind } from "src/lib/posts/dynamics/constants";

/**
 * Soroban caps ledger entries written per transaction (100 on the public network) and
 * each imported participant writes one, plus the contract state. Stay well below.
 */
export const DEFAULT_IMPORT_BATCH = 40;
const VERIFY_ROUNDS = 3;

export type MigrationAction =
  | "migrated"
  | "would_migrate"
  | "skipped"
  | "failed";

export type MigrationEntry = {
  dynamic_id: string;
  kind: string;
  action: MigrationAction;
  reason?: string;
  contract_id?: string;
  participants: number;
  charges: number;
  amount_centavos: string;
  /** Rows in the database disagree with the stored `progress_count`. */
  progress_warning?: string;
  fee_stroops?: string;
};

export type MigrationReport = {
  mode: ReturnType<typeof readChainMode>;
  dryRun: boolean;
  candidates: number;
  migrated: number;
  skipped: number;
  failed: number;
  fee_stroops: string;
  entries: MigrationEntry[];
};

export type MigrateOptions = {
  /** Default true: nothing is written to the database or the network. */
  dryRun?: boolean;
  limit?: number;
  dynamicId?: string;
  kinds?: readonly string[];
  batchSize?: number;
  chain?: DynamicChain;
  now?: Date;
  log?: (line: string) => void;
};

type Candidate = {
  dynamic_id: string;
  kind: string;
  status: string;
  config: unknown;
  goal_count: number | null;
  starts_at: Date | null;
  ends_at: Date | null;
  establishment_id: string | null;
  token: string | null;
  progress_count: number;
  chain_status: string;
  contract_id: string | null;
};

type Snapshot = {
  participants: string[];
  charges: { chargeId: string; amountCentavos: bigint }[];
  amountCentavos: bigint;
};

const candidateSelect = {
  dynamic_id: true,
  kind: true,
  status: true,
  config: true,
  goal_count: true,
  starts_at: true,
  ends_at: true,
  establishment_id: true,
  token: true,
  progress_count: true,
  chain_status: true,
  contract_id: true,
} as const;

function toSource(row: Candidate): DynamicChainSource | null {
  if (!isDynamicKind(row.kind)) return null;
  return {
    dynamic_id: row.dynamic_id,
    kind: row.kind,
    config: row.config,
    goal_count: row.goal_count,
    starts_at: row.starts_at,
    ends_at: row.ends_at,
    establishment_id: row.establishment_id,
    token: row.token,
  };
}

async function loadSnapshot(dynamicId: string): Promise<Snapshot> {
  const rows = await prisma.postDynamicParticipation.findMany({
    where: { dynamic_id: dynamicId },
    orderBy: [{ created_at: "asc" }, { participation_id: "asc" }],
    select: {
      user_id: true,
      charge_id: true,
      charge: { select: { amount: true } },
    },
  });
  const participants = new Set<string>();
  const charges = new Map<string, bigint>();
  for (const row of rows) {
    if (row.charge_id) {
      if (!row.charge) continue;
      charges.set(row.charge_id, toCentavos(row.charge.amount));
    } else {
      participants.add(row.user_id);
    }
  }
  let amount = BigInt(0);
  for (const value of charges.values()) amount += value;
  return {
    participants: [...participants],
    charges: [...charges.entries()].map(([chargeId, amountCentavos]) => ({
      chargeId,
      amountCentavos,
    })),
    amountCentavos: amount,
  };
}

function expectedCount(snapshot: Snapshot): number {
  return snapshot.participants.length + snapshot.charges.length;
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Why a dynamic cannot be migrated right now, or null when it can. */
function skipReason(row: Candidate, now: Date): string | null {
  if (!isDynamicKind(row.kind)) return "unknown_kind";
  if (row.status !== "active") return "not_active";
  if (row.ends_at && row.ends_at.getTime() <= now.getTime()) {
    return "ended_pending_close";
  }
  if (row.goal_count != null && row.progress_count >= row.goal_count) {
    return "goal_reached_pending_close";
  }
  return null;
}

async function selectCandidates(options: MigrateOptions): Promise<Candidate[]> {
  const kindFilter = options.kinds?.length ? { kind: { in: [...options.kinds] } } : {};
  const rows = await prisma.postDynamic.findMany({
    where: {
      ...(options.dynamicId ? { dynamic_id: options.dynamicId } : {}),
      ...kindFilter,
      OR: [
        { chain_status: "legacy" },
        // A previous run died after claiming the dynamic; only this script sets
        // `contract_id` on a pending row (the deploy worker sets it on activation).
        { chain_status: "pending", contract_id: { not: null } },
      ],
    },
    orderBy: [{ created_at: "asc" }, { dynamic_id: "asc" }],
    take: options.limit,
    select: candidateSelect,
  });
  return rows.filter((row) => isChainKindEnabled(row.kind));
}

async function releaseClaim(row: Candidate): Promise<void> {
  await prisma.postDynamic.updateMany({
    where: { dynamic_id: row.dynamic_id, chain_status: "pending" },
    data: { chain_status: "legacy", contract_id: null, deploy_tx_hash: null, config_hash: null },
  });
}

/**
 * Brings the contract to exactly what the database holds. Imports are idempotent, so
 * every round only sends what the previous rounds did not, and the loop stops once the
 * contract matches a fresh read of the database.
 */
async function importUntilEqual(
  chain: DynamicChain,
  contractId: string,
  dynamicId: string,
  batchSize: number,
  tally: { fee: bigint }
): Promise<Snapshot> {
  const sentParticipants = new Set<string>();
  const sentCharges = new Set<string>();

  // Each pass reads the database again, so rows created while importing are caught. A
  // pass that finds nothing new is the verification pass.
  for (let round = 0; round <= VERIFY_ROUNDS; round += 1) {
    const snapshot = await loadSnapshot(dynamicId);
    const newParticipants = snapshot.participants.filter((id) => !sentParticipants.has(id));
    const newCharges = snapshot.charges.filter((c) => !sentCharges.has(c.chargeId));

    if (newParticipants.length === 0 && newCharges.length === 0) {
      const state = await chain.readState(contractId);
      if (
        state.progressCount === expectedCount(snapshot) &&
        state.progressAmount === snapshot.amountCentavos
      ) {
        return snapshot;
      }
      break;
    }

    const work: Array<
      | { kind: "participant"; id: string }
      | { kind: "charge"; id: string; amount: bigint }
    > = [
      ...newParticipants.map((id) => ({ kind: "participant" as const, id })),
      ...newCharges.map((c) => ({
        kind: "charge" as const,
        id: c.chargeId,
        amount: c.amountCentavos,
      })),
    ];
    for (const batch of chunk(work, batchSize)) {
      const tx = await chain.importBatch(contractId, {
        participantUserIds: batch.flatMap((w) => (w.kind === "participant" ? [w.id] : [])),
        charges: batch.flatMap((w) =>
          w.kind === "charge" ? [{ chargeId: w.id, amountCentavos: w.amount }] : []
        ),
      });
      if (tx.feeStroops) tally.fee += tx.feeStroops;
      for (const w of batch) {
        (w.kind === "participant" ? sentParticipants : sentCharges).add(w.id);
      }
    }
  }
  throw new Error("El contrato no coincide con la base de datos tras importar");
}

async function migrateOne(
  row: Candidate,
  chain: DynamicChain,
  secret: string,
  batchSize: number
): Promise<{ contractId: string; snapshot: Snapshot; fee: bigint }> {
  const source = toSource(row);
  if (!source) throw new Error("Tipo de dinámica desconocido");
  const hash = configHash(source, secret).toString("hex");
  const contractId = chain.contractIdFor(source);
  const tally = { fee: BigInt(0) };

  // Claim first: from here on shadow copies wait in the queue and `on` mode pauses, so
  // nothing slips between the snapshot and the activation.
  const claimed = await prisma.postDynamic.updateMany({
    where: {
      dynamic_id: row.dynamic_id,
      OR: [
        { chain_status: "legacy" },
        { chain_status: "pending", contract_id: { not: null } },
      ],
    },
    data: { chain_status: "pending", contract_id: contractId, config_hash: hash },
  });
  if (claimed.count !== 1) throw new Error("La dinámica cambió mientras se migraba");

  try {
    const deployed = await chain.deploy(source);
    if (deployed.feeStroops) tally.fee += deployed.feeStroops;
    if (deployed.value.contractId !== contractId) {
      throw new Error("La dirección del contrato no es la esperada");
    }
    const snapshot = await importUntilEqual(chain, contractId, row.dynamic_id, batchSize, tally);

    const activated = await prisma.postDynamic.updateMany({
      where: { dynamic_id: row.dynamic_id, chain_status: "pending", contract_id: contractId },
      data: {
        chain_status: "active",
        deploy_tx_hash: deployed.txHash || null,
      },
    });
    if (activated.count !== 1) throw new Error("No se pudo activar el contrato");

    // Cost accounting next to the rest of the jobs.
    await prisma.dynamicChainJob.upsert({
      where: {
        dynamic_id_type_dedupe_key: {
          dynamic_id: row.dynamic_id,
          type: "deploy",
          dedupe_key: `migrate:${hash.slice(0, 40)}`,
        },
      },
      create: {
        dynamic_id: row.dynamic_id,
        contract_id: contractId,
        type: "deploy",
        dedupe_key: `migrate:${hash.slice(0, 40)}`,
        status: "done",
        attempts: 1,
        tx_hash: deployed.txHash || null,
        fee_stroops: tally.fee,
        last_error: "migration",
      },
      update: { fee_stroops: tally.fee },
    });

    // Aligns `last_synced_ledger` and reports (or, in `on` mode, corrects) any drift.
    await syncMirrorFromChain(row.dynamic_id, { chain, expectedContractId: contractId });
    return { contractId, snapshot, fee: tally.fee };
  } catch (error) {
    await releaseClaim(row);
    throw error;
  }
}

/**
 * Gives a contract to every active dynamic that predates the integration and loads its
 * participants and charges. Dry-run by default.
 *
 * Needs `DYNAMICS_CHAIN_MODE` shadow or on: with it off nothing would copy the writes
 * that happen after activation, and the contract would fall behind.
 */
export async function migrateLegacyDynamics(
  options: MigrateOptions = {}
): Promise<MigrationReport> {
  const dryRun = options.dryRun ?? true;
  const mode = readChainMode();
  if (mode === "off") {
    throw new Error(
      "DYNAMICS_CHAIN_MODE está en off. Usa shadow u on antes de migrar para no perder escrituras."
    );
  }
  const config = readChainConfig();
  const now = options.now ?? new Date();
  const batchSize = Math.max(1, options.batchSize ?? DEFAULT_IMPORT_BATCH);
  const log = options.log ?? (() => undefined);

  const candidates = await selectCandidates(options);
  const report: MigrationReport = {
    mode,
    dryRun,
    candidates: candidates.length,
    migrated: 0,
    skipped: 0,
    failed: 0,
    fee_stroops: "0",
    entries: [],
  };
  let totalFee = BigInt(0);
  const chain = dryRun ? null : (options.chain ?? getDynamicChain());

  for (const row of candidates) {
    const entry: MigrationEntry = {
      dynamic_id: row.dynamic_id,
      kind: row.kind,
      action: "skipped",
      participants: 0,
      charges: 0,
      amount_centavos: "0",
    };
    report.entries.push(entry);

    const reason = skipReason(row, now);
    if (reason) {
      entry.reason = reason;
      log(`- ${row.dynamic_id} (${row.kind}) omitida: ${reason}`);
      continue;
    }

    try {
      const before = await loadSnapshot(row.dynamic_id);
      entry.participants = before.participants.length;
      entry.charges = before.charges.length;
      entry.amount_centavos = before.amountCentavos.toString();
      if (expectedCount(before) !== row.progress_count) {
        entry.progress_warning = `progress_count=${row.progress_count} pero hay ${expectedCount(before)} participaciones`;
      }

      if (dryRun || !chain) {
        entry.action = "would_migrate";
        log(
          `- ${row.dynamic_id} (${row.kind}) se migraría: ${entry.participants} participantes, ${entry.charges} cobros`
        );
        continue;
      }

      const done = await migrateOne(row, chain, config.hashSecret, batchSize);
      entry.action = "migrated";
      entry.contract_id = done.contractId;
      entry.participants = done.snapshot.participants.length;
      entry.charges = done.snapshot.charges.length;
      entry.amount_centavos = done.snapshot.amountCentavos.toString();
      entry.fee_stroops = done.fee.toString();
      totalFee += done.fee;
      report.migrated += 1;
      log(`- ${row.dynamic_id} (${row.kind}) migrada → ${done.contractId}`);
    } catch (error) {
      entry.action = "failed";
      entry.reason = error instanceof Error ? error.message : String(error);
      report.failed += 1;
      log(`- ${row.dynamic_id} (${row.kind}) FALLÓ: ${entry.reason}`);
    }
  }

  report.fee_stroops = totalFee.toString();
  report.skipped = report.entries.filter((e) => e.action === "skipped").length;
  return report;
}
