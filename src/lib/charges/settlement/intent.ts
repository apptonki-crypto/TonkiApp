import { Prisma } from "src/generated/prisma/client";
import prisma from "src/lib/db";
import {
  CHARGE_STATUS_PENDING,
  isChargeToken,
} from "src/lib/charges/constants";
import {
  PAY_STATUS_AWAITING,
  PAY_STATUS_CONFIRMED,
  STELLAR_ACCOUNT_PATTERN,
  createPaymentMemo,
  readSettlementAsset,
  readSettlementNetwork,
  settlementAssetCode,
  type SettlementAsset,
} from "src/lib/charges/settlement/config";
import {
  RateUnavailableError,
  assetAmountForPesos,
  formatAssetAmount,
  readMxnPerAsset,
} from "src/lib/charges/settlement/rate";
import type { PaymentIntent } from "src/lib/charges/types";

export type LockIntentResult =
  | { ok: true; intent: PaymentIntent }
  | { ok: false; status: number; error: string };

const ADMIN_BLOCK = "Una cuenta de administrador no puede pagar este cobro.";

export function assetFromColumns(
  code: string | null,
  issuer: string | null
): SettlementAsset | null {
  if (!code) return null;
  if (!issuer) return code === "XLM" ? { type: "native" } : null;
  return {
    type: code.length <= 4 ? "credit_alphanum4" : "credit_alphanum12",
    code,
    issuer,
  };
}

export function intentFromCharge(charge: {
  pay_asset_code: string | null;
  pay_asset_issuer: string | null;
  pay_amount: Prisma.Decimal | null;
  pay_rate_mxn: Prisma.Decimal | null;
  pay_destination: string | null;
  pay_memo: string | null;
  pay_network: string | null;
  expires_at: Date;
}): PaymentIntent | null {
  const asset = assetFromColumns(charge.pay_asset_code, charge.pay_asset_issuer);
  if (
    !asset ||
    !charge.pay_amount ||
    !charge.pay_rate_mxn ||
    !charge.pay_destination ||
    !charge.pay_memo ||
    !charge.pay_network
  ) {
    return null;
  }
  return {
    destination: charge.pay_destination,
    memo: charge.pay_memo,
    network: charge.pay_network === "mainnet" ? "mainnet" : "testnet",
    asset:
      asset.type === "native"
        ? { type: "native" }
        : {
            type: asset.type,
            code: asset.code,
            issuer: asset.issuer,
          },
    asset_code: settlementAssetCode(asset),
    amount: formatAssetAmount(charge.pay_amount),
    rate_mxn: charge.pay_rate_mxn.toFixed(2),
    expires_at: charge.expires_at.toISOString(),
  };
}

/**
 * Freezes how much the customer must send: asset amount, destination wallet and
 * memo. Only the first customer to start paying can settle this charge.
 */
export async function lockPaymentIntent(
  token: string,
  userId: string,
  deps: {
    readRate?: typeof readMxnPerAsset;
    now?: () => Date;
  } = {}
): Promise<LockIntentResult> {
  if (!isChargeToken(token)) {
    return { ok: false, status: 404, error: "Este código no existe." };
  }
  const now = (deps.now ?? (() => new Date()))();

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

  const charge = await prisma.charge.findUnique({
    where: { token },
    select: {
      charge_id: true,
      admin_id: true,
      amount: true,
      expires_at: true,
      status: true,
      pay_asset_code: true,
      pay_asset_issuer: true,
      pay_amount: true,
      pay_rate_mxn: true,
      pay_destination: true,
      pay_memo: true,
      pay_network: true,
      pay_payer_user_id: true,
      pay_status: true,
      admin: { select: { wallet_address: true } },
    },
  });
  if (!charge) {
    return { ok: false, status: 404, error: "Este código no existe." };
  }
  if (charge.admin_id === userId) {
    return { ok: false, status: 403, error: ADMIN_BLOCK };
  }
  if (charge.status !== CHARGE_STATUS_PENDING) {
    return { ok: false, status: 409, error: "Este código ya acreditó Tonkis." };
  }
  if (charge.expires_at.getTime() <= now.getTime()) {
    return {
      ok: false,
      status: 410,
      error: "Este código venció. Pide uno nuevo en el negocio.",
    };
  }
  if (charge.pay_status === PAY_STATUS_CONFIRMED) {
    return { ok: false, status: 409, error: "Este cobro ya fue pagado." };
  }

  if (charge.pay_payer_user_id && charge.pay_payer_user_id !== userId) {
    return {
      ok: false,
      status: 409,
      error: "Otro cliente ya está pagando este cobro.",
    };
  }
  if (charge.pay_payer_user_id === userId) {
    const existing = intentFromCharge(charge);
    if (existing) return { ok: true, intent: existing };
  }

  const destination = charge.admin.wallet_address?.trim() ?? "";
  if (!STELLAR_ACCOUNT_PATTERN.test(destination)) {
    return {
      ok: false,
      status: 409,
      error: "El negocio aún no tiene una wallet para recibir pagos.",
    };
  }

  const asset = readSettlementAsset();
  let rate: Prisma.Decimal;
  try {
    rate = await (deps.readRate ?? readMxnPerAsset)(asset);
  } catch (err) {
    if (err instanceof RateUnavailableError) {
      return {
        ok: false,
        status: 503,
        error: "No pudimos cotizar el pago. Intenta de nuevo en un momento.",
      };
    }
    throw err;
  }

  const amount = assetAmountForPesos(charge.amount, rate);
  if (amount.lte(0)) {
    return { ok: false, status: 400, error: "El monto del cobro es inválido." };
  }

  const memo = createPaymentMemo();
  const network = readSettlementNetwork();
  const locked = await prisma.charge.updateMany({
    where: {
      charge_id: charge.charge_id,
      status: CHARGE_STATUS_PENDING,
      pay_payer_user_id: null,
    },
    data: {
      pay_asset_code: settlementAssetCode(asset),
      pay_asset_issuer: asset.type === "native" ? null : asset.issuer,
      pay_amount: amount,
      pay_rate_mxn: rate,
      pay_destination: destination,
      pay_memo: memo,
      pay_network: network,
      pay_payer_user_id: userId,
      pay_status: PAY_STATUS_AWAITING,
    },
  });
  if (locked.count !== 1) {
    return {
      ok: false,
      status: 409,
      error: "Otro cliente ya está pagando este cobro.",
    };
  }

  const intent = intentFromCharge({
    pay_asset_code: settlementAssetCode(asset),
    pay_asset_issuer: asset.type === "native" ? null : asset.issuer,
    pay_amount: amount,
    pay_rate_mxn: rate,
    pay_destination: destination,
    pay_memo: memo,
    pay_network: network,
    expires_at: charge.expires_at,
  });
  if (!intent) {
    return { ok: false, status: 500, error: "No se pudo preparar el pago." };
  }
  return { ok: true, intent };
}
