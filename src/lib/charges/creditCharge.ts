import { Prisma } from "src/generated/prisma/client";
import prisma from "src/lib/db";
import {
  CHARGE_STATUS_CREDITED,
  CHARGE_STATUS_PENDING,
  isChargeToken,
} from "src/lib/charges/constants";
import { PAY_STATUS_CONFIRMED } from "src/lib/charges/settlement/config";
import {
  formatPesosFromCents,
  rewardDescriptionForCharge,
  rewardTitleForEstablishment,
  tonkisFromAmountCents,
} from "src/lib/charges/tonkis";
import { spendableTonkis } from "src/lib/rewards/balance";
import { applyConsumptionForCreditedCharge } from "src/lib/posts/dynamics";
import { scheduleChainWork } from "src/lib/posts/chain/schedule";

const ADMIN_BLOCK =
  "Una cuenta de administrador no puede recibir estos Tonkis.";

export type CreditChargeResult =
  | {
      ok: true;
      points: number;
      establishment_name: string;
      total_points: number;
    }
  | { ok: false; status: number; error: string };

export function centsFromStoredAmount(amount: Prisma.Decimal | number | string): number {
  return new Prisma.Decimal(amount).mul(100).toDecimalPlaces(0).toNumber();
}

export function pointsForStoredCharge(charge: {
  amount: Prisma.Decimal | number | string;
  cashback_percent: number;
}): number {
  return tonkisFromAmountCents(
    centsFromStoredAmount(charge.amount),
    charge.cashback_percent
  );
}

type ClaimChargeRow = {
  charge_id: string;
  establishment_id: string;
  admin_id: string;
  amount: Prisma.Decimal;
  cashback_percent: number;
  expires_at: Date;
  status: string;
  claimed_by_user_id: string | null;
  pay_status: string | null;
  pay_payer_user_id: string | null;
  establishment: { name: string };
};

function alreadyCreditedMessage(): string {
  return "Este código ya acreditó Tonkis.";
}

export async function creditChargeForUser(
  token: string,
  userId: string
): Promise<CreditChargeResult> {
  if (!isChargeToken(token)) {
    return { ok: false, status: 404, error: "Este código no existe." };
  }

  const user = await prisma.user.findUnique({
    where: { user_id: userId },
    select: { user_id: true, type: true, status: true },
  });
  if (!user || user.status !== "active") {
    return { ok: false, status: 401, error: "No autenticado" };
  }
  if (user.type !== "user") {
    return { ok: false, status: 403, error: ADMIN_BLOCK };
  }

  let queuedChainJobs = false;
  const result = await prisma.$transaction(async (tx) => {
    const charge = await tx.charge.findUnique({
      where: { token },
      select: {
        charge_id: true,
        establishment_id: true,
        admin_id: true,
        amount: true,
        cashback_percent: true,
        expires_at: true,
        status: true,
        claimed_by_user_id: true,
        pay_status: true,
        pay_payer_user_id: true,
        establishment: { select: { name: true } },
      },
    });
    if (!charge) {
      return { ok: false as const, status: 404, error: "Este código no existe." };
    }
    if (charge.admin_id === userId) {
      return { ok: false as const, status: 403, error: ADMIN_BLOCK };
    }

    const decision = decideClaim(charge, userId);
    if (!decision.ok) return decision;

    const locked = await tx.charge.updateMany({
      where: {
        charge_id: charge.charge_id,
        status: CHARGE_STATUS_PENDING,
        pay_status: PAY_STATUS_CONFIRMED,
        pay_payer_user_id: userId,
      },
      data: {
        status: CHARGE_STATUS_CREDITED,
        claimed_by_user_id: userId,
      },
    });
    if (locked.count !== 1) {
      const again = await tx.charge.findUnique({
        where: { charge_id: charge.charge_id },
        select: { status: true },
      });
      if (again?.status === CHARGE_STATUS_CREDITED) {
        return {
          ok: false as const,
          status: 409,
          error: alreadyCreditedMessage(),
        };
      }
      return {
        ok: false as const,
        status: 409,
        error: "No se pudieron acreditar los Tonkis. Intenta de nuevo.",
      };
    }

    const amountLabel = formatPesosFromCents(centsFromStoredAmount(charge.amount));
    const reward = await tx.reward.create({
      data: {
        user_id: userId,
        establishment_id: charge.establishment_id,
        title: rewardTitleForEstablishment(charge.establishment.name),
        description: rewardDescriptionForCharge(
          charge.cashback_percent,
          amountLabel
        ),
        points: decision.points,
        status: "active",
      },
    });

    await tx.charge.update({
      where: { charge_id: charge.charge_id },
      data: { reward_id: reward.reward_id },
    });

    const pointsAgg = await tx.reward.aggregate({
      where: { user_id: userId },
      _sum: { points: true },
    });
    const heldAgg = await tx.prizeRedemption.aggregate({
      where: {
        user_id: userId,
        status: { in: ["pending", "delivered"] },
      },
      _sum: { points: true },
    });

    const consumption = await applyConsumptionForCreditedCharge(tx, {
      chargeId: charge.charge_id,
      establishmentId: charge.establishment_id,
      userId,
      amount: charge.amount,
    });
    if ((consumption?.queuedDynamicIds?.length ?? 0) > 0) queuedChainJobs = true;

    return {
      ok: true as const,
      points: decision.points,
      establishment_name: charge.establishment.name,
      total_points: spendableTonkis(
        pointsAgg._sum.points ?? 0,
        heldAgg._sum.points ?? 0
      ),
    };
  });
  if (queuedChainJobs && result.ok) scheduleChainWork();
  return result;
}

function decideClaim(
  charge: ClaimChargeRow,
  userId: string
): { ok: true; points: number } | { ok: false; status: number; error: string } {
  if (charge.status === CHARGE_STATUS_CREDITED || charge.claimed_by_user_id) {
    return { ok: false, status: 409, error: alreadyCreditedMessage() };
  }
  if (charge.status !== CHARGE_STATUS_PENDING) {
    return { ok: false, status: 409, error: alreadyCreditedMessage() };
  }
  // Tonkis only follow a payment that was verified on-chain for this customer.
  if (
    charge.pay_status !== PAY_STATUS_CONFIRMED ||
    charge.pay_payer_user_id !== userId
  ) {
    return {
      ok: false,
      status: 402,
      error: "Falta confirmar el pago de este cobro.",
    };
  }
  // No expiry check here: a confirmed payment was locked before the code expired,
  // and the customer's money has already moved.
  const points = pointsForStoredCharge(charge);
  if (points <= 0) {
    return {
      ok: false,
      status: 400,
      error: "Este consumo no alcanza para acreditar Tonkis.",
    };
  }
  if (charge.admin_id === userId) {
    return { ok: false, status: 403, error: ADMIN_BLOCK };
  }
  return { ok: true, points };
}
