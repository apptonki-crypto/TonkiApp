import { Prisma } from "src/generated/prisma/client";
import prisma from "src/lib/db";
import {
  CHARGE_STATUS_PENDING,
  isChargeToken,
} from "src/lib/charges/constants";
import {
  creditChargeForUser,
  type CreditChargeResult,
} from "src/lib/charges/creditCharge";
import {
  PAY_STATUS_AWAITING,
  PAY_STATUS_CONFIRMED,
  TX_HASH_PATTERN,
  readHorizonUrl,
} from "src/lib/charges/settlement/config";
import { verifyPaymentOnChain } from "src/lib/charges/settlement/horizon";
import { assetFromColumns } from "src/lib/charges/settlement/intent";

export type SettleResult =
  | Extract<CreditChargeResult, { ok: true }>
  | {
      ok: false;
      status: number;
      error: string;
      /** The transfer is not visible on Stellar yet; the client should retry. */
      retry?: boolean;
    };

function isUniqueConflict(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002"
  );
}

const REASON_MESSAGE = {
  failed: "La transferencia falló en la red.",
  memo_mismatch: "La transferencia no corresponde a este cobro.",
  no_matching_payment: "La transferencia no llegó a la wallet del negocio.",
  underpaid: "La transferencia es menor al monto del cobro.",
} as const;

/**
 * Verifies the customer's Stellar transfer, marks the charge paid, then credits
 * Tonkis through the same one-time transaction as before.
 */
export async function settleChargePayment(
  token: string,
  userId: string,
  txHash: string | null,
  deps: { fetchImpl?: typeof fetch; horizonUrl?: string } = {}
): Promise<SettleResult> {
  if (!isChargeToken(token)) {
    return { ok: false, status: 404, error: "Este código no existe." };
  }

  const charge = await prisma.charge.findUnique({
    where: { token },
    select: {
      charge_id: true,
      status: true,
      pay_asset_code: true,
      pay_asset_issuer: true,
      pay_amount: true,
      pay_destination: true,
      pay_memo: true,
      pay_network: true,
      pay_payer_user_id: true,
      pay_status: true,
    },
  });
  if (!charge) {
    return { ok: false, status: 404, error: "Este código no existe." };
  }
  if (charge.pay_payer_user_id !== userId || !charge.pay_status) {
    return {
      ok: false,
      status: 409,
      error: "Inicia el pago de este cobro antes de confirmarlo.",
    };
  }
  if (charge.status !== CHARGE_STATUS_PENDING) {
    return { ok: false, status: 409, error: "Este código ya acreditó Tonkis." };
  }

  // Already verified: only the credit is missing (a retry after a failed credit).
  if (charge.pay_status === PAY_STATUS_CONFIRMED) {
    return creditChargeForUser(token, userId);
  }
  if (charge.pay_status !== PAY_STATUS_AWAITING) {
    return { ok: false, status: 409, error: "Este cobro no admite pagos." };
  }

  const hash = txHash?.trim() ?? "";
  if (!TX_HASH_PATTERN.test(hash)) {
    return { ok: false, status: 400, error: "Falta el hash de la transferencia." };
  }

  const asset = assetFromColumns(charge.pay_asset_code, charge.pay_asset_issuer);
  if (!asset || !charge.pay_amount || !charge.pay_destination || !charge.pay_memo) {
    return { ok: false, status: 409, error: "El pago de este cobro no está listo." };
  }

  const payer = await prisma.user.findUnique({
    where: { user_id: userId },
    select: { wallet_address: true },
  });

  const verification = await verifyPaymentOnChain(
    deps.horizonUrl ??
      readHorizonUrl(charge.pay_network === "mainnet" ? "mainnet" : "testnet"),
    {
      hash: hash.toLowerCase(),
      destination: charge.pay_destination,
      memo: charge.pay_memo,
      asset,
      minAmount: charge.pay_amount,
      payerAddress: payer?.wallet_address?.trim() || null,
    },
    deps.fetchImpl
  );

  if (!verification.ok) {
    if (verification.reason === "not_found" || verification.reason === "unavailable") {
      return {
        ok: false,
        status: 202,
        retry: true,
        error: "Esperando que la red confirme tu transferencia.",
      };
    }
    return { ok: false, status: 402, error: REASON_MESSAGE[verification.reason] };
  }

  try {
    const marked = await prisma.charge.updateMany({
      where: {
        charge_id: charge.charge_id,
        status: CHARGE_STATUS_PENDING,
        pay_status: PAY_STATUS_AWAITING,
        pay_payer_user_id: userId,
      },
      data: {
        pay_status: PAY_STATUS_CONFIRMED,
        pay_tx_hash: hash.toLowerCase(),
        pay_confirmed_at: new Date(),
      },
    });
    if (marked.count !== 1) {
      // A concurrent request confirmed it first; credit is idempotent below.
      return creditChargeForUser(token, userId);
    }
  } catch (err) {
    if (isUniqueConflict(err)) {
      return {
        ok: false,
        status: 409,
        error: "Esta transferencia ya se usó para otro cobro.",
      };
    }
    throw err;
  }

  return creditChargeForUser(token, userId);
}
