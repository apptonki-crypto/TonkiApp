import { Prisma } from "src/generated/prisma/client";

import type { SettlementAsset } from "src/lib/charges/settlement/config";

export type ExpectedPayment = {
  hash: string;
  destination: string;
  memo: string;
  asset: SettlementAsset;
  minAmount: Prisma.Decimal;
  /** Sender wallet when the payer's Pollar wallet is known. */
  payerAddress?: string | null;
};

export type PaymentVerification =
  | { ok: true; paid: Prisma.Decimal }
  | {
      ok: false;
      reason:
        | "not_found"
        | "failed"
        | "memo_mismatch"
        | "no_matching_payment"
        | "underpaid"
        | "unavailable";
    };

type HorizonTx = {
  successful?: boolean;
  memo_type?: string;
  memo?: string;
};

type HorizonOp = {
  type?: string;
  from?: string;
  to?: string;
  asset_type?: string;
  asset_code?: string;
  asset_issuer?: string;
  amount?: string;
};

function assetMatches(op: HorizonOp, asset: SettlementAsset): boolean {
  if (asset.type === "native") return op.asset_type === "native";
  return (
    op.asset_type !== "native" &&
    op.asset_code === asset.code &&
    op.asset_issuer === asset.issuer
  );
}

async function getJson<T>(
  fetchImpl: typeof fetch,
  url: string
): Promise<{ status: number; body: T | null }> {
  const res = await fetchImpl(url, {
    headers: { accept: "application/json" },
    cache: "no-store",
  });
  const body = res.ok ? ((await res.json().catch(() => null)) as T | null) : null;
  return { status: res.status, body };
}

/**
 * Confirms a Stellar transaction really paid this charge: it succeeded, carries
 * the charge memo, and sent at least `minAmount` of the settlement asset to the
 * business wallet. Payments from other senders do not count.
 */
export async function verifyPaymentOnChain(
  horizonUrl: string,
  expected: ExpectedPayment,
  fetchImpl: typeof fetch = fetch
): Promise<PaymentVerification> {
  let tx: { status: number; body: HorizonTx | null };
  let ops: { status: number; body: { _embedded?: { records?: HorizonOp[] } } | null };
  try {
    const hash = encodeURIComponent(expected.hash);
    tx = await getJson<HorizonTx>(fetchImpl, `${horizonUrl}/transactions/${hash}`);
    if (tx.status === 404) return { ok: false, reason: "not_found" };
    if (!tx.body) return { ok: false, reason: "unavailable" };
    if (tx.body.successful !== true) return { ok: false, reason: "failed" };
    if (tx.body.memo_type !== "text" || tx.body.memo !== expected.memo) {
      return { ok: false, reason: "memo_mismatch" };
    }
    ops = await getJson(fetchImpl, `${horizonUrl}/transactions/${hash}/payments?limit=200`);
    if (!ops.body) return { ok: false, reason: "unavailable" };
  } catch {
    return { ok: false, reason: "unavailable" };
  }

  const records = ops.body._embedded?.records ?? [];
  let paid = new Prisma.Decimal(0);
  let matched = false;
  for (const op of records) {
    if (op.type !== "payment") continue;
    if (op.to !== expected.destination) continue;
    if (!assetMatches(op, expected.asset)) continue;
    if (expected.payerAddress && op.from !== expected.payerAddress) continue;
    if (!op.amount) continue;
    matched = true;
    paid = paid.add(new Prisma.Decimal(op.amount));
  }

  if (!matched) return { ok: false, reason: "no_matching_payment" };
  if (paid.lt(expected.minAmount)) return { ok: false, reason: "underpaid" };
  return { ok: true, paid };
}
