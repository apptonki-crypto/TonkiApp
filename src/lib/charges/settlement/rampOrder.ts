import { Prisma } from "src/generated/prisma/client";
import prisma from "src/lib/db";
import {
  CHARGE_STATUS_PENDING,
  isChargeToken,
} from "src/lib/charges/constants";
import { PAY_STATUS_AWAITING } from "src/lib/charges/settlement/config";

export const RAMP_ORDER_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const RAMP_STATE_PATTERN = /^[a-z][a-z0-9_]{0,19}$/;
/** States after which Pollar will not move the order again to completion. */
const RAMP_REPLACEABLE_STATES = ["failed", "refunded"];

export type RecordRampOrderResult =
  | { ok: true }
  | { ok: false; status: number; error: string };

export function parseRampOrderId(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  return RAMP_ORDER_ID_PATTERN.test(value) ? value : null;
}

export function parseRampOrderState(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim().toLowerCase();
  return RAMP_STATE_PATTERN.test(value) ? value : null;
}

/**
 * Remembers the Pollar ramp order the payer opened so the page can resume it
 * after a reload. Only the payer who locked the charge can write, and only
 * while it is still waiting for payment. Payment instructions are never kept.
 * The order lives in the browser's Pollar session; this never calls Pollar.
 */
export async function recordRampOrder(
  token: string,
  userId: string,
  input: { orderId: unknown; state: unknown }
): Promise<RecordRampOrderResult> {
  if (!isChargeToken(token)) {
    return { ok: false, status: 404, error: "Este código no existe." };
  }
  const orderId = parseRampOrderId(input.orderId);
  const state = parseRampOrderState(input.state);
  if (!orderId || !state) {
    return { ok: false, status: 400, error: "La orden de carga no es válida." };
  }

  const charge = await prisma.charge.findUnique({
    where: { token },
    select: {
      charge_id: true,
      status: true,
      pay_status: true,
      pay_payer_user_id: true,
      ramp_order_id: true,
      ramp_order_state: true,
    },
  });
  if (!charge) {
    return { ok: false, status: 404, error: "Este código no existe." };
  }
  if (charge.pay_payer_user_id !== userId) {
    return {
      ok: false,
      status: 409,
      error: "Inicia el pago de este cobro antes de cargar saldo.",
    };
  }
  if (
    charge.status !== CHARGE_STATUS_PENDING ||
    charge.pay_status !== PAY_STATUS_AWAITING
  ) {
    return { ok: false, status: 409, error: "Este cobro ya no admite cargas." };
  }

  const replaceable =
    charge.ramp_order_id === null ||
    charge.ramp_order_id === orderId ||
    RAMP_REPLACEABLE_STATES.includes(charge.ramp_order_state ?? "");
  if (!replaceable) {
    return {
      ok: false,
      status: 409,
      error: "Este cobro ya tiene una carga de saldo en curso.",
    };
  }

  try {
    const updated = await prisma.charge.updateMany({
      where: {
        charge_id: charge.charge_id,
        status: CHARGE_STATUS_PENDING,
        pay_status: PAY_STATUS_AWAITING,
        pay_payer_user_id: userId,
        OR: [
          { ramp_order_id: null },
          { ramp_order_id: orderId },
          { ramp_order_state: { in: RAMP_REPLACEABLE_STATES } },
        ],
      },
      data: { ramp_order_id: orderId, ramp_order_state: state },
    });
    if (updated.count !== 1) {
      return {
        ok: false,
        status: 409,
        error: "Este cobro ya no admite cargas.",
      };
    }
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return {
        ok: false,
        status: 409,
        error: "Esta orden ya se usó para otro cobro.",
      };
    }
    throw err;
  }
  return { ok: true };
}
