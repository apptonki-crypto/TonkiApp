import prisma from "src/lib/db";
import type { DynamicKind, ParticipationSource } from "src/lib/posts/dynamics/constants";
import { evaluateAndCloseDynamic } from "src/lib/posts/dynamics/close";
import {
  isUniqueConflict,
  readPromoCode,
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
  | "already_participated";

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

  return prisma.$transaction(async (tx) => {
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
}
