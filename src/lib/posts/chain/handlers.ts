import prisma from "src/lib/db";
import { isChainAuthoritative } from "src/lib/posts/chain/authority";
import { readChainConfig } from "src/lib/posts/chain/config";
import { configHash, type DynamicChainSource } from "src/lib/posts/chain/hashes";
import { syncMirrorFromChain } from "src/lib/posts/chain/mirror";
import {
  ChainTransactionError,
  type ChainTx,
  type DynamicChain,
} from "src/lib/posts/chain/types";
import type { ClaimedJob, JobDone } from "src/lib/posts/chain/jobs";
import { isDynamicKind } from "src/lib/posts/dynamics/constants";
import { isUniqueConflict } from "src/lib/posts/dynamics/rules";

export type HandlerContext = {
  chain: DynamicChain;
  now: Date;
};

export type JobHandler = (job: ClaimedJob, ctx: HandlerContext) => Promise<JobDone>;

function payloadRecord(payload: unknown): Record<string, unknown> {
  return payload && typeof payload === "object" && !Array.isArray(payload)
    ? (payload as Record<string, unknown>)
    : {};
}

function txInfo(tx: ChainTx<unknown>): JobDone {
  return { txHash: tx.txHash || null, feeStroops: tx.feeStroops };
}

const dynamicSelect = {
  dynamic_id: true,
  kind: true,
  status: true,
  config: true,
  goal_count: true,
  starts_at: true,
  ends_at: true,
  establishment_id: true,
  token: true,
  chain_status: true,
  contract_id: true,
  config_hash: true,
} as const;

/** Waiting is not failing: retried with backoff until the contract is live. */
function notYetActive(): ChainTransactionError {
  return new ChainTransactionError("El contrato todavía no está activo", true);
}

export const deployHandler: JobHandler = async (job, ctx) => {
  const dynamic = await prisma.postDynamic.findUnique({
    where: { dynamic_id: job.dynamic_id },
    select: dynamicSelect,
  });
  if (!dynamic) return { note: "dynamic_deleted" };
  if (dynamic.chain_status !== "pending") return { note: "not_pending" };
  if (!isDynamicKind(dynamic.kind)) return { note: "unknown_kind" };

  const source: DynamicChainSource = {
    dynamic_id: dynamic.dynamic_id,
    kind: dynamic.kind,
    config: dynamic.config,
    goal_count: dynamic.goal_count,
    starts_at: dynamic.starts_at,
    ends_at: dynamic.ends_at,
    establishment_id: dynamic.establishment_id,
    token: dynamic.token,
  };
  const currentHash = configHash(source, readChainConfig().hashSecret).toString("hex");
  const wanted = payloadRecord(job.payload).config_hash;
  // An edit queued a newer deploy for this dynamic; this one would build a stale contract.
  if (typeof wanted === "string" && wanted !== currentHash) {
    return { note: "superseded" };
  }

  const deployed = await ctx.chain.deploy(source);
  const activated = await prisma.postDynamic.updateMany({
    where: {
      dynamic_id: dynamic.dynamic_id,
      chain_status: "pending",
      config_hash: currentHash,
    },
    data: {
      contract_id: deployed.value.contractId,
      deploy_tx_hash: deployed.txHash || null,
      chain_status: "active",
      last_synced_ledger: deployed.ledger,
    },
  });
  return {
    ...txInfo(deployed),
    note: activated.count === 1 ? null : "edited_during_deploy",
  };
};

export const participationHandler: JobHandler = async (job, ctx) => {
  const userId = payloadRecord(job.payload).user_id;
  if (typeof userId !== "string") return { note: "bad_payload" };

  const dynamic = await prisma.postDynamic.findUnique({
    where: { dynamic_id: job.dynamic_id },
    select: dynamicSelect,
  });
  if (!dynamic) return { note: "dynamic_deleted" };
  if (dynamic.chain_status === "pending") throw notYetActive();
  if (dynamic.chain_status !== "active" || !dynamic.contract_id) {
    return { note: `chain_${dynamic.chain_status}` };
  }

  const tx = await ctx.chain.participate(dynamic.contract_id, userId);
  await prisma.postDynamicParticipation.updateMany({
    where: {
      dynamic_id: dynamic.dynamic_id,
      user_id: userId,
      person_key: userId,
      tx_hash: null,
    },
    data: { tx_hash: tx.txHash },
  });
  const ok = tx.value === "recorded" || tx.value === "already_recorded";
  return { ...txInfo(tx), note: ok ? null : `divergence:${tx.value}` };
};

export const consumeHandler: JobHandler = async (job, ctx) => {
  const body = payloadRecord(job.payload);
  const chargeId = body.charge_id;
  const userId = body.user_id;
  const amount = body.amount_centavos;
  if (
    typeof chargeId !== "string" ||
    typeof userId !== "string" ||
    typeof amount !== "string" ||
    !/^\d+$/.test(amount)
  ) {
    return { note: "bad_payload" };
  }

  const dynamic = await prisma.postDynamic.findUnique({
    where: { dynamic_id: job.dynamic_id },
    select: dynamicSelect,
  });
  if (!dynamic) return { note: "dynamic_deleted" };
  if (dynamic.chain_status === "pending") throw notYetActive();
  if (dynamic.chain_status !== "active" || !dynamic.contract_id) {
    throw new ChainTransactionError(
      `La dinámica no tiene contrato (${dynamic.chain_status})`,
      false
    );
  }

  const tx = await ctx.chain.applyConsumption(
    dynamic.contract_id,
    chargeId,
    BigInt(amount)
  );
  const applied = tx.value === "recorded" || tx.value === "already_recorded";

  if (isChainAuthoritative(dynamic)) {
    if (applied) await ensureChargeParticipation(dynamic.dynamic_id, userId, chargeId, tx.txHash);
    await syncMirrorFromChain(dynamic.dynamic_id, {
      chain: ctx.chain,
      expectedContractId: dynamic.contract_id,
    });
    return {
      ...txInfo(tx),
      note: applied ? null : `skipped:${tx.value}`,
    };
  }

  // Shadow: the database already applied this charge; only link the transaction.
  await prisma.postDynamicParticipation.updateMany({
    where: { dynamic_id: dynamic.dynamic_id, charge_id: chargeId, tx_hash: null },
    data: { tx_hash: tx.txHash },
  });
  return { ...txInfo(tx), note: applied ? null : `divergence:${tx.value}` };
};

async function ensureChargeParticipation(
  dynamicId: string,
  userId: string,
  chargeId: string,
  txHash: string
): Promise<void> {
  const existing = await prisma.postDynamicParticipation.findFirst({
    where: { dynamic_id: dynamicId, charge_id: chargeId },
    select: { participation_id: true, tx_hash: true },
  });
  if (existing) {
    if (!existing.tx_hash && txHash) {
      await prisma.postDynamicParticipation.update({
        where: { participation_id: existing.participation_id },
        data: { tx_hash: txHash },
      });
    }
    return;
  }
  try {
    await prisma.postDynamicParticipation.create({
      data: {
        dynamic_id: dynamicId,
        user_id: userId,
        source: "charge",
        charge_id: chargeId,
        person_key: null,
        tx_hash: txHash || null,
      },
    });
  } catch (err) {
    if (!isUniqueConflict(err)) throw err;
  }
}

/** `close` forces `exhausted` (edits); `evaluate` applies the goal/time transition. */
export const closeHandler: JobHandler = async (job, ctx) => {
  if (!job.contract_id) return { note: "no_contract" };
  const force = job.type === "close" || payloadRecord(job.payload).force === true;
  const tx = force
    ? await ctx.chain.close(job.contract_id)
    : await ctx.chain.evaluate(job.contract_id);

  // Only touch the mirror when this contract is still the dynamic's current one.
  const synced = await syncMirrorFromChain(job.dynamic_id, {
    chain: ctx.chain,
    expectedContractId: job.contract_id,
  });
  const diverged =
    synced.synced && !synced.wrote && synced.diffs.length > 0
      ? `divergence:${synced.diffs.map((d) => d.field).join(",")}`
      : null;
  return { ...txInfo(tx), note: diverged };
};

export const bumpHandler: JobHandler = async (job, ctx) => {
  if (!job.contract_id) return { note: "no_contract" };
  const tx = await ctx.chain.bump(job.contract_id);
  return txInfo(tx);
};

export const CHAIN_HANDLERS: Record<ClaimedJob["type"], JobHandler> = {
  deploy: deployHandler,
  participation: participationHandler,
  consume: consumeHandler,
  close: closeHandler,
  evaluate: closeHandler,
  bump: bumpHandler,
};
