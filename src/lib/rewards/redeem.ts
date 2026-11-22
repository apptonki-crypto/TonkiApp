import { randomBytes } from "crypto";

import prisma from "src/lib/db";

import { spendableTonkis } from "./balance";
import { lockSpendableLedger } from "./ledger";
import type { PrizeRedemptionItem, PrizeRedemptionStatus } from "./types";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function redemptionCodeFromBytes(bytes: Uint8Array): string {
  let code = "";
  for (let index = 0; index < 8; index += 1) {
    code += CODE_ALPHABET[bytes[index]! % CODE_ALPHABET.length];
  }
  return code;
}

function newRedemptionCode(): string {
  return redemptionCodeFromBytes(randomBytes(8));
}

function isUniqueConflict(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: string }).code === "P2002"
  );
}

function asStatus(status: string): PrizeRedemptionStatus {
  if (status === "delivered" || status === "cancelled") return status;
  return "pending";
}

function toItem(
  row: {
    redemption_id: string;
    title: string;
    points: number;
    code: string;
    status: string;
    establishment_id: string;
    created_at: Date;
    delivered_at: Date | null;
  },
  establishmentName: string,
  customerName: string
): PrizeRedemptionItem {
  return {
    id: row.redemption_id,
    title: row.title,
    points: row.points,
    code: row.code,
    status: asStatus(row.status),
    establishment_id: row.establishment_id,
    establishment_name: establishmentName,
    customer_name: customerName,
    created_at: row.created_at.toISOString(),
    delivered_at: row.delivered_at ? row.delivered_at.toISOString() : null,
  };
}

function rankForCounter(status: PrizeRedemptionStatus): number {
  if (status === "pending") return 0;
  if (status === "delivered") return 1;
  return 2;
}

/** Pendientes primero; dentro de cada estado, el más nuevo arriba. */
export function orderRedemptionsForCounter(
  items: PrizeRedemptionItem[]
): PrizeRedemptionItem[] {
  return [...items].sort((left, right) => {
    const byStatus = rankForCounter(left.status) - rankForCounter(right.status);
    if (byStatus !== 0) return byStatus;
    if (left.created_at === right.created_at) return 0;
    return left.created_at < right.created_at ? 1 : -1;
  });
}

type RedeemResult =
  | { ok: true; redemption: PrizeRedemptionItem; total_points: number }
  | { ok: false; status: number; error: string };

export async function redeemCatalogPrize(input: {
  userId: string;
  establishmentRewardId: string;
  now?: Date;
  createCode?: () => string;
}): Promise<RedeemResult> {
  const now = input.now ?? new Date();
  const createCode = input.createCode ?? newRedemptionCode;

  return prisma.$transaction(async (tx) => {
    const ledger = await lockSpendableLedger(tx, input.userId);
    const item = await tx.establishmentReward.findUnique({
      where: { establishment_reward_id: input.establishmentRewardId },
      select: {
        establishment_reward_id: true,
        title: true,
        value_tonkis: true,
        establishment_id: true,
        establishment: { select: { name: true } },
      },
    });
    if (!item) {
      return { ok: false, status: 404, error: "Ese premio ya no está disponible." };
    }
    if (!Number.isInteger(item.value_tonkis) || item.value_tonkis < 1) {
      return { ok: false, status: 400, error: "Ese premio no se puede canjear." };
    }

    const balance = spendableTonkis(ledger.earned, ledger.held);
    if (balance < item.value_tonkis) {
      return {
        ok: false,
        status: 409,
        error: "No te alcanzan los Tonkis para este premio.",
      };
    }

    const customer = await tx.user.findUnique({
      where: { user_id: input.userId },
      select: { name: true },
    });

    let created: {
      redemption_id: string;
      title: string;
      points: number;
      code: string;
      status: string;
      establishment_id: string;
      created_at: Date;
      delivered_at: Date | null;
    } | null = null;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        created = await tx.prizeRedemption.create({
          data: {
            user_id: input.userId,
            establishment_id: item.establishment_id,
            establishment_reward_id: item.establishment_reward_id,
            title: item.title,
            points: item.value_tonkis,
            code: createCode(),
            status: "pending",
            created_at: now,
          },
        });
        break;
      } catch (err) {
        if (!isUniqueConflict(err) || attempt === 4) throw err;
      }
    }

    if (!created) {
      return { ok: false, status: 500, error: "No se pudo crear el canje." };
    }

    return {
      ok: true,
      redemption: toItem(created, item.establishment.name, customer?.name?.trim() || "Cliente"),
      total_points: spendableTonkis(ledger.earned, ledger.held + item.value_tonkis),
    };
  });
}

type StatusResult =
  | { ok: true; redemption: PrizeRedemptionItem }
  | { ok: false; status: number; error: string };

async function lockRedemption(tx: { $queryRaw: RawQuery }, redemptionId: string) {
  await tx.$queryRaw`
    SELECT redemption_id
    FROM PrizeRedemption
    WHERE redemption_id = ${redemptionId}
    FOR UPDATE
  `;
}

type RawQuery = <T>(query: TemplateStringsArray, ...values: unknown[]) => Promise<T>;

export async function deliverPrizeRedemption(input: {
  adminId: string;
  redemptionId: string;
  now?: Date;
}): Promise<StatusResult> {
  const now = input.now ?? new Date();
  return prisma.$transaction(async (tx) => {
    await lockRedemption(tx, input.redemptionId);
    const row = await tx.prizeRedemption.findUnique({
      where: { redemption_id: input.redemptionId },
      include: {
        establishment: { select: { admin_id: true, name: true } },
        user: { select: { name: true } },
      },
    });
    if (!row || row.establishment.admin_id !== input.adminId) {
      return { ok: false, status: 404, error: "Canje no encontrado." };
    }
    if (row.status !== "pending") {
      return { ok: false, status: 409, error: "Ese canje ya no está pendiente." };
    }
    const updated = await tx.prizeRedemption.updateMany({
      where: { redemption_id: row.redemption_id, status: "pending" },
      data: { status: "delivered", delivered_at: now },
    });
    if (updated.count !== 1) {
      return { ok: false, status: 409, error: "Ese canje ya no está pendiente." };
    }
    return {
      ok: true,
      redemption: toItem(
        { ...row, status: "delivered", delivered_at: now },
        row.establishment.name,
        row.user.name
      ),
    };
  });
}

export async function cancelPrizeRedemption(input: {
  actorUserId: string;
  actorType: string;
  redemptionId: string;
  now?: Date;
}): Promise<StatusResult> {
  if (input.actorType !== "user" && input.actorType !== "admin") {
    return { ok: false, status: 403, error: "Prohibido" };
  }
  const now = input.now ?? new Date();
  return prisma.$transaction(async (tx) => {
    await lockRedemption(tx, input.redemptionId);
    const row = await tx.prizeRedemption.findUnique({
      where: { redemption_id: input.redemptionId },
      include: {
        establishment: { select: { admin_id: true, name: true } },
        user: { select: { name: true } },
      },
    });
    if (!row) {
      return { ok: false, status: 404, error: "Canje no encontrado." };
    }
    const owns =
      input.actorType === "user"
        ? row.user_id === input.actorUserId
        : row.establishment.admin_id === input.actorUserId;
    if (!owns) {
      return { ok: false, status: 404, error: "Canje no encontrado." };
    }
    if (row.status !== "pending") {
      return { ok: false, status: 409, error: "Ese canje ya no está pendiente." };
    }
    const updated = await tx.prizeRedemption.updateMany({
      where: { redemption_id: row.redemption_id, status: "pending" },
      data: { status: "cancelled", cancelled_at: now },
    });
    if (updated.count !== 1) {
      return { ok: false, status: 409, error: "Ese canje ya no está pendiente." };
    }
    return {
      ok: true,
      redemption: toItem(
        { ...row, status: "cancelled", delivered_at: row.delivered_at },
        row.establishment.name,
        row.user.name
      ),
    };
  });
}

const redemptionInclude = {
  establishment: { select: { name: true } },
  user: { select: { name: true } },
} as const;

export async function listRedemptionsForCustomer(
  userId: string
): Promise<PrizeRedemptionItem[]> {
  const [pending, rest] = await Promise.all([
    prisma.prizeRedemption.findMany({
      where: { user_id: userId, status: "pending" },
      orderBy: { created_at: "desc" },
      take: 20,
      include: redemptionInclude,
    }),
    prisma.prizeRedemption.findMany({
      where: { user_id: userId, status: { not: "pending" } },
      orderBy: { created_at: "desc" },
      take: 10,
      include: redemptionInclude,
    }),
  ]);
  return orderRedemptionsForCounter(
    [...pending, ...rest].map((row) => toItem(row, row.establishment.name, row.user.name))
  );
}

export async function listRedemptionsForAdmin(
  adminId: string
): Promise<PrizeRedemptionItem[]> {
  const [pending, delivered] = await Promise.all([
    prisma.prizeRedemption.findMany({
      where: { establishment: { admin_id: adminId }, status: "pending" },
      orderBy: { created_at: "desc" },
      take: 40,
      include: redemptionInclude,
    }),
    prisma.prizeRedemption.findMany({
      where: { establishment: { admin_id: adminId }, status: "delivered" },
      orderBy: { created_at: "desc" },
      take: 10,
      include: redemptionInclude,
    }),
  ]);
  return orderRedemptionsForCounter(
    [...pending, ...delivered].map((row) =>
      toItem(row, row.establishment.name, row.user.name)
    )
  );
}
