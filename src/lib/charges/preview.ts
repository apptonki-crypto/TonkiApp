import prisma from "src/lib/db";
import {
  CHARGE_STATUS_CREDITED,
  CHARGE_STATUS_PENDING,
  isChargeToken,
} from "src/lib/charges/constants";
import {
  centsFromStoredAmount,
  pointsForStoredCharge,
} from "src/lib/charges/creditCharge";
import { formatPesosFromCents } from "src/lib/charges/tonkis";
import type { ChargePreview } from "src/lib/charges/types";

export type { ChargePreview };

const ADMIN_BLOCK =
  "Una cuenta de administrador no puede recibir estos Tonkis.";

export function claimAvailability(input: {
  viewerType: string;
  viewerId: string;
  adminId: string;
  status: string;
  expired: boolean;
  points: number;
  claimedByUserId: string | null;
  establishmentName: string;
}): { can_claim: boolean; block_reason: string | null } {
  if (input.viewerType !== "user" || input.viewerId === input.adminId) {
    return { can_claim: false, block_reason: ADMIN_BLOCK };
  }
  if (input.status === CHARGE_STATUS_CREDITED) {
    if (input.claimedByUserId === input.viewerId) {
      return {
        can_claim: false,
        block_reason: `Ya recibiste ${input.points.toLocaleString("es-MX")} Tonkis de ${input.establishmentName}.`,
      };
    }
    return {
      can_claim: false,
      block_reason: "Este código ya acreditó Tonkis.",
    };
  }
  if (input.expired || input.status !== CHARGE_STATUS_PENDING) {
    return {
      can_claim: false,
      block_reason: "Este código venció. Pide uno nuevo en el negocio.",
    };
  }
  if (input.points <= 0) {
    return {
      can_claim: false,
      block_reason: "Este consumo no alcanza para acreditar Tonkis.",
    };
  }
  return { can_claim: true, block_reason: null };
}

export async function loadChargePreview(
  token: string,
  viewerId: string
): Promise<
  | { ok: true; preview: ChargePreview }
  | { ok: false; status: number; error: string }
> {
  if (!isChargeToken(token)) {
    return { ok: false, status: 404, error: "Este código no existe." };
  }

  const viewer = await prisma.user.findUnique({
    where: { user_id: viewerId },
    select: { user_id: true, type: true, status: true },
  });
  if (!viewer || viewer.status !== "active") {
    return { ok: false, status: 401, error: "No autenticado" };
  }

  const charge = await prisma.charge.findUnique({
    where: { token },
    select: {
      admin_id: true,
      amount: true,
      cashback_percent: true,
      expires_at: true,
      status: true,
      claimed_by_user_id: true,
      establishment: {
        select: { name: true, avatar_url: true },
      },
      reward: { select: { points: true } },
    },
  });
  if (!charge) {
    return { ok: false, status: 404, error: "Este código no existe." };
  }

  const calculated = pointsForStoredCharge(charge);
  const points =
    charge.status === CHARGE_STATUS_CREDITED && charge.reward
      ? charge.reward.points
      : calculated;
  const expired =
    charge.status === CHARGE_STATUS_PENDING &&
    charge.expires_at.getTime() <= Date.now();
  const availability = claimAvailability({
    viewerType: viewer.type,
    viewerId: viewer.user_id,
    adminId: charge.admin_id,
    status: charge.status,
    expired,
    points,
    claimedByUserId: charge.claimed_by_user_id,
    establishmentName: charge.establishment.name,
  });

  return {
    ok: true,
    preview: {
      establishment_name: charge.establishment.name,
      establishment_avatar_url: charge.establishment.avatar_url,
      amount: formatPesosFromCents(centsFromStoredAmount(charge.amount)),
      cashback_percent: charge.cashback_percent,
      points,
      status: charge.status,
      expires_at: charge.expires_at.toISOString(),
      expired,
      can_claim: availability.can_claim,
      block_reason: availability.block_reason,
    },
  };
}
