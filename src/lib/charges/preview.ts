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
import {
  PAY_STATUS_CONFIRMED,
  STELLAR_ACCOUNT_PATTERN,
} from "src/lib/charges/settlement/config";
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
  payerUserId?: string | null;
  payStatus?: string | null;
  businessWalletReady?: boolean;
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
  const paidByViewer =
    input.payStatus === PAY_STATUS_CONFIRMED &&
    input.payerUserId === input.viewerId;
  if ((input.expired && !paidByViewer) || input.status !== CHARGE_STATUS_PENDING) {
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
  if (input.payerUserId && input.payerUserId !== input.viewerId) {
    return {
      can_claim: false,
      block_reason: "Otro cliente ya está pagando este cobro.",
    };
  }
  if (input.businessWalletReady === false) {
    return {
      can_claim: false,
      block_reason: "El negocio aún no tiene una wallet para recibir pagos.",
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
      pay_status: true,
      pay_payer_user_id: true,
      ramp_order_id: true,
      ramp_order_state: true,
      admin: { select: { wallet_address: true } },
      establishment: {
        select: { establishment_id: true, name: true, avatar_url: true },
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
  const payerIsViewer = charge.pay_payer_user_id === viewer.user_id;
  const availability = claimAvailability({
    viewerType: viewer.type,
    viewerId: viewer.user_id,
    adminId: charge.admin_id,
    status: charge.status,
    expired,
    points,
    claimedByUserId: charge.claimed_by_user_id,
    establishmentName: charge.establishment.name,
    payerUserId: charge.pay_payer_user_id,
    payStatus: charge.pay_status,
    businessWalletReady: STELLAR_ACCOUNT_PATTERN.test(
      charge.admin.wallet_address?.trim() ?? ""
    ),
  });

  return {
    ok: true,
    preview: {
      establishment_id: charge.establishment.establishment_id,
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
      pay_status: charge.pay_status,
      payer_is_viewer: payerIsViewer,
      business_wallet_ready: STELLAR_ACCOUNT_PATTERN.test(
        charge.admin.wallet_address?.trim() ?? ""
      ),
      // Only the payer sees the order id; it is useless to anyone else.
      ramp_order_id: payerIsViewer ? charge.ramp_order_id : null,
      ramp_order_state: payerIsViewer ? charge.ramp_order_state : null,
    },
  };
}
