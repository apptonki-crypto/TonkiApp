import { Prisma } from "src/generated/prisma/client";

import {
  settlementAssetCode,
  type SettlementAsset,
} from "src/lib/charges/settlement/config";

const COINGECKO_IDS: Record<string, string> = {
  XLM: "stellar",
  USDC: "usd-coin",
  EURC: "euro-coin",
};

const CACHE_MS = 60_000;
const cache = new Map<string, { value: Prisma.Decimal; at: number }>();

export class RateUnavailableError extends Error {
  constructor() {
    super("rate_unavailable");
    this.name = "RateUnavailableError";
  }
}

/**
 * Pesos per 1 unit of the settlement asset.
 * `PAYMENT_MXN_PER_ASSET` pins the rate (testnet, demos). Otherwise CoinGecko.
 */
export async function readMxnPerAsset(
  asset: SettlementAsset,
  fetchImpl: typeof fetch = fetch,
  now = Date.now()
): Promise<Prisma.Decimal> {
  const pinned = process.env.PAYMENT_MXN_PER_ASSET?.trim();
  if (pinned) {
    const value = new Prisma.Decimal(pinned);
    if (value.lte(0)) throw new RateUnavailableError();
    return value;
  }

  const code = settlementAssetCode(asset).toUpperCase();
  const id = COINGECKO_IDS[code];
  if (!id) throw new RateUnavailableError();

  const hit = cache.get(code);
  if (hit && now - hit.at < CACHE_MS) return hit.value;

  try {
    const res = await fetchImpl(
      `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=mxn`,
      { headers: { accept: "application/json" }, cache: "no-store" }
    );
    if (!res.ok) throw new RateUnavailableError();
    const body = (await res.json()) as Record<string, { mxn?: unknown }>;
    const mxn = body[id]?.mxn;
    if (typeof mxn !== "number" || !Number.isFinite(mxn) || mxn <= 0) {
      throw new RateUnavailableError();
    }
    const value = new Prisma.Decimal(mxn);
    cache.set(code, { value, at: now });
    return value;
  } catch (err) {
    if (err instanceof RateUnavailableError) throw err;
    throw new RateUnavailableError();
  }
}

/** Rounds up to 7 decimals (Stellar precision) so the business is never short. */
export function assetAmountForPesos(
  pesos: Prisma.Decimal | number | string,
  mxnPerAsset: Prisma.Decimal
): Prisma.Decimal {
  return new Prisma.Decimal(pesos)
    .div(mxnPerAsset)
    .toDecimalPlaces(7, Prisma.Decimal.ROUND_UP);
}

/** Stellar amount string with no exponent and no trailing noise. */
export function formatAssetAmount(amount: Prisma.Decimal): string {
  return amount.toFixed(7);
}
