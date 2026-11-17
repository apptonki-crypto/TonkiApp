import { randomBytes } from "crypto";

import { readPollarNetwork, type PollarNetwork } from "src/lib/auth/pollarPublicConfig";

export const PAY_STATUS_AWAITING = "awaiting";
export const PAY_STATUS_CONFIRMED = "confirmed";

export const STELLAR_ACCOUNT_PATTERN = /^G[A-Z2-7]{55}$/;
export const TX_HASH_PATTERN = /^[a-fA-F0-9]{64}$/;

export type SettlementAsset =
  | { type: "native" }
  | {
      type: "credit_alphanum4" | "credit_alphanum12";
      code: string;
      issuer: string;
    };

const HORIZON_URLS: Record<PollarNetwork, string> = {
  testnet: "https://horizon-testnet.stellar.org",
  mainnet: "https://horizon.stellar.org",
};

/**
 * `PAYMENT_ASSET` is `native` (XLM, default) or `CODE:ISSUER`.
 * The server decides the asset; the browser only receives the locked intent.
 */
export function parseSettlementAsset(raw: string | undefined): SettlementAsset {
  const value = raw?.trim();
  if (!value || value.toLowerCase() === "native" || value.toUpperCase() === "XLM") {
    return { type: "native" };
  }
  const [code, issuer, ...rest] = value.split(":");
  if (
    rest.length > 0 ||
    !code ||
    !issuer ||
    !/^[A-Za-z0-9]{1,12}$/.test(code) ||
    !STELLAR_ACCOUNT_PATTERN.test(issuer)
  ) {
    throw new Error("PAYMENT_ASSET debe ser native o CODE:ISSUER");
  }
  return {
    type: code.length <= 4 ? "credit_alphanum4" : "credit_alphanum12",
    code,
    issuer,
  };
}

export function readSettlementAsset(): SettlementAsset {
  return parseSettlementAsset(process.env.PAYMENT_ASSET);
}

export function settlementAssetCode(asset: SettlementAsset): string {
  return asset.type === "native" ? "XLM" : asset.code;
}

export function readSettlementNetwork(): PollarNetwork {
  return readPollarNetwork();
}

export function readHorizonUrl(network = readSettlementNetwork()): string {
  const override = process.env.HORIZON_URL?.trim();
  return (override || HORIZON_URLS[network]).replace(/\/+$/, "");
}

/** Text memo, 22 bytes. Stellar allows 28. Links the transfer to one charge. */
export function createPaymentMemo(): string {
  return `tonki-${randomBytes(8).toString("hex")}`;
}
