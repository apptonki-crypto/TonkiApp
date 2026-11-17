import prisma from "src/lib/db";
import {
  isChainAuthoritative,
  isChainRequiredButUnavailable,
  isShadowMirrored,
} from "src/lib/posts/chain/authority";
import { getDynamicChain } from "src/lib/posts/chain";
import { enqueueChainJob } from "src/lib/posts/chain/jobs";
import { syncMirrorFromChain } from "src/lib/posts/chain/mirror";
import type { ChainOutcome } from "src/lib/posts/chain/types";
import type { DynamicKind, ParticipationSource } from "src/lib/posts/dynamics/constants";
import { evaluateAndCloseDynamic } from "src/lib/posts/dynamics/close";
import {
  closeTransition,
  dynamicRecordSelect,
  isUniqueConflict,
  readPromoCode,
  toDynamicRecord,
  type DynamicRecord,
} from "src/lib/posts/dynamics/rules";
import {
  toPublicDynamicSummary,
  type PublicDynamicSummary,
} from "src/lib/posts/dynamics/summary";

const KIND_BY_SOURCE = {
  going: "going",
  promo_code: "promo_code",
  qr: "qr",
} as const satisfies Record<Exclude<ParticipationSource, "charge">, DynamicKind>;

export type ParticipateInDynamicInput = {
  dynamicId: string;
  userId: string;
  source: keyof typeof KIND_BY_SOURCE;
  code?: string;
  now?: Date;
};

export type DynamicFailureCode =
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "wrong_kind"
  | "exhausted"
  | "expired"
  | "upcoming"
  | "invalid_code"
  | "already_participated"
  | "chain_unavailable";

export type DynamicFailure = {
  ok: false;
  code: DynamicFailureCode;
  status: number;
  error: string;
};

export type ParticipateResult =
  | {
      ok: true;
      participation_id: string;
      dynamic: PublicDynamicSummary;
    }
  | DynamicFailure;

function fail(
  code: DynamicFailureCode,
  status: number,
  error: string
): DynamicFailure {
  return { ok: false, code, status, error };
}

const CHAIN_PENDING_MESSAGE = "Esta dinámica se está activando en Stellar. Intenta en unos minutos.";
const CHAIN_FAILED_MESSAGE = "Esta dinámica no pudo activarse.";
const CHAIN_DOWN_MESSAGE =
  "No pudimos registrar tu participación en Stellar. Intenta de nuevo.";

type TxResult = ParticipateResult | { chainRoute: DynamicRecord };

export async function participateInDynamic(
  input: ParticipateInDynamicInput
): Promise<ParticipateResult> {
  const now = input.now ?? new Date();
  const user = await prisma.user.findUnique({
    where: { user_id: input.userId },
    select: { user_id: true, type: true, status: true },
  });
  if (!user || user.status !== "active") {
    return fail("unauthenticated", 401, "No autenticado");
  }
  if (user.type !== "user") {
    return fail(
      "forbidden",
      403,
      "Una cuenta de administrador no puede participar."
    );
  }

  const first: TxResult = await prisma.$transaction(async (tx): Promise<TxResult> => {
    const current = await evaluateAndCloseDynamic(tx, input.dynamicId, now);
    if (!current) {
      return fail("not_found", 404, "Esta dinámica no existe.");
    }
    if (current.kind !== KIND_BY_SOURCE[input.source]) {
      return fail(
        "wrong_kind",
        409,
        "Esta acción no corresponde a la dinámica."
      );
    }
    if (isChainAuthoritative(current)) {
      // Stellar is slow: leave the database transaction before talking to it.
      return { chainRoute: current };
    }
    if (isChainRequiredButUnavailable(current)) {
      return fail(
        "chain_unavailable",
        current.chain_status === "failed" ? 409 : 503,
        current.chain_status === "failed" ? CHAIN_FAILED_MESSAGE : CHAIN_PENDING_MESSAGE
      );
    }
    if (current.status === "exhausted") {
      return fail("exhausted", 409, "Esta dinámica ya se agotó.");
    }
    if (current.status === "expired") {
      return fail("expired", 410, "Esta dinámica ya venció.");
    }
    if (current.starts_at && now.getTime() < current.starts_at.getTime()) {
      return fail("upcoming", 409, "Esta dinámica todavía no empieza.");
    }

    if (input.source === "promo_code") {
      const expected = readPromoCode(current.config);
      const submitted = (input.code ?? "").trim().toUpperCase();
      if (!expected || submitted.length === 0 || submitted !== expected) {
        return fail("invalid_code", 400, "El código no coincide.");
      }
    }

    const existing = await tx.postDynamicParticipation.findFirst({
      where: {
        dynamic_id: current.dynamic_id,
        user_id: input.userId,
        person_key: input.userId,
      },
      select: { participation_id: true },
    });
    if (existing) {
      return fail(
        "already_participated",
        409,
        "Ya participaste en esta dinámica."
      );
    }

    let participationId: string;
    try {
      const created = await tx.postDynamicParticipation.create({
        data: {
          dynamic_id: current.dynamic_id,
          user_id: input.userId,
          source: input.source,
          charge_id: null,
          person_key: input.userId,
        },
        select: { participation_id: true },
      });
      participationId = created.participation_id;
    } catch (err) {
      if (isUniqueConflict(err)) {
        return fail(
          "already_participated",
          409,
          "Ya participaste en esta dinámica."
        );
      }
      throw err;
    }

    await tx.postDynamic.update({
      where: { dynamic_id: current.dynamic_id },
      data: { progress_count: { increment: 1 } },
    });

    // Shadow mode: the database decided; copy the participation to the contract later.
    if (isShadowMirrored(current)) {
      await enqueueChainJob(tx, {
        dynamicId: current.dynamic_id,
        type: "participation",
        dedupeKey: input.userId,
        contractId: current.contract_id ?? null,
        payload: { user_id: input.userId },
      });
    }

    const closed = await evaluateAndCloseDynamic(tx, current.dynamic_id, now);
    return {
      ok: true as const,
      participation_id: participationId,
      dynamic: toPublicDynamicSummary(closed ?? current, {
        viewerParticipated: true,
        now,
      }),
    };
  });

  if ("chainRoute" in first) {
    return participateOnChain(input, first.chainRoute, now);
  }
  return first;
}

const OUTCOME_FAILURE: Partial<
  Record<ChainOutcome, { code: DynamicFailureCode; status: number; error: string }>
> = {
  exhausted: { code: "exhausted", status: 409, error: "Esta dinámica ya se agotó." },
  expired: { code: "expired", status: 410, error: "Esta dinámica ya venció." },
  upcoming: { code: "upcoming", status: 409, error: "Esta dinámica todavía no empieza." },
  wrong_kind: { code: "wrong_kind", status: 409, error: "Esta acción no corresponde a la dinámica." },
};

/**
 * Contract-authoritative participation. The database is only checked first to avoid
 * paying fees for requests that will be rejected; the contract has the final word and
 * the database is written only after the transaction is confirmed.
 *
 * Idempotent end to end: if a previous attempt confirmed on-chain but the database write
 * was lost, the contract answers `already_recorded` and the row is created now.
 */
async function participateOnChain(
  input: ParticipateInDynamicInput,
  current: DynamicRecord,
  now: Date
): Promise<ParticipateResult> {
  const contractId = current.contract_id;
  if (!contractId) return fail("chain_unavailable", 503, CHAIN_PENDING_MESSAGE);

  if (current.kind !== KIND_BY_SOURCE[input.source]) {
    return fail("wrong_kind", 409, "Esta acción no corresponde a la dinámica.");
  }
  const ended =
    current.status !== "active" ? current.status : closeTransition(current, now);
  if (ended === "exhausted") return fail("exhausted", 409, "Esta dinámica ya se agotó.");
  if (ended === "expired") return fail("expired", 410, "Esta dinámica ya venció.");
  if (current.starts_at && now.getTime() < current.starts_at.getTime()) {
    return fail("upcoming", 409, "Esta dinámica todavía no empieza.");
  }
  if (input.source === "promo_code") {
    const expected = readPromoCode(current.config);
    const submitted = (input.code ?? "").trim().toUpperCase();
    if (!expected || submitted.length === 0 || submitted !== expected) {
      return fail("invalid_code", 400, "El código no coincide.");
    }
  }

  const already = await prisma.postDynamicParticipation.findFirst({
    where: {
      dynamic_id: current.dynamic_id,
      user_id: input.userId,
      person_key: input.userId,
    },
    select: { participation_id: true },
  });
  if (already) {
    return fail("already_participated", 409, "Ya participaste en esta dinámica.");
  }

  const chain = getDynamicChain();
  let sent;
  try {
    sent = await chain.participate(contractId, input.userId);
  } catch {
    return fail("chain_unavailable", 503, CHAIN_DOWN_MESSAGE);
  }

  if (sent.value !== "recorded" && sent.value !== "already_recorded") {
    // The contract refused (it may know about a close the database has not seen yet).
    await syncMirrorQuietly(current, contractId);
    const failure = OUTCOME_FAILURE[sent.value];
    if (failure) return fail(failure.code, failure.status, failure.error);
    return fail("chain_unavailable", 409, CHAIN_DOWN_MESSAGE);
  }

  let participationId: string;
  try {
    const created = await prisma.postDynamicParticipation.create({
      data: {
        dynamic_id: current.dynamic_id,
        user_id: input.userId,
        source: input.source,
        charge_id: null,
        person_key: input.userId,
        tx_hash: sent.txHash || null,
      },
      select: { participation_id: true },
    });
    participationId = created.participation_id;
  } catch (err) {
    if (isUniqueConflict(err)) {
      return fail("already_participated", 409, "Ya participaste en esta dinámica.");
    }
    throw err;
  }

  const synced = await syncMirrorQuietly(current, contractId);
  if (!synced) {
    // Reconciliation will correct it; keep the feed moving in the meantime.
    await prisma.postDynamic.update({
      where: { dynamic_id: current.dynamic_id },
      data: { progress_count: { increment: 1 } },
    });
  }

  const row = await prisma.postDynamic.findUnique({
    where: { dynamic_id: current.dynamic_id },
    select: dynamicRecordSelect,
  });
  const record = (row ? toDynamicRecord(row) : null) ?? current;
  return {
    ok: true as const,
    participation_id: participationId,
    dynamic: toPublicDynamicSummary(record, { viewerParticipated: true, now }),
  };
}

async function syncMirrorQuietly(
  current: DynamicRecord,
  contractId: string
): Promise<boolean> {
  try {
    const result = await syncMirrorFromChain(current.dynamic_id, {
      expectedContractId: contractId,
    });
    return result.synced;
  } catch {
    return false;
  }
}
