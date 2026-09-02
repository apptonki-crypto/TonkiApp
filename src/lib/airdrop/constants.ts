/** Static airdrop fee / emitter wallets (admin-configured policy). */
export const AIRDROP_EMISOR_PUBLIC_KEY: string =
  "Wallet" 
  //"GB6GI6BSNQ6MXYT6YNM6GWZKQNPMILPE7GIQ2FWDCVM2RPU6Z3XO4DPT";

/** Destination for the 1% app fee. */
export const AIRDROP_APP_FEE_PUBLIC_KEY: string =
  "GDAWEZNX2GQFFYDNGBSQQXUNF3LGRBVR6YPZFUR2AERDMT4G24SC7KK2";

/** Share of configured amount paid to eligible users (split by loyalty points). */
export const AIRDROP_USER_POOL_RATIO = 0.98;

/** Share retained for Stellar network fees (not paid as a payment op). */
export const AIRDROP_STELLAR_RESERVE_RATIO = 0.01;

/** Share paid to the app fee wallet. */
export const AIRDROP_APP_FEE_RATIO = 0.01;

/** Supported on-chain payout assets (dropdown order). Tonkis are DB-only; not a token. */
export const AIRDROP_ASSET_CODES = ["USDC", "XLM"] as const;
export type AirdropAssetCode = (typeof AIRDROP_ASSET_CODES)[number];
/** Includes deprecated on-chain TONKI for historical airdrop logs only. */
export type AirdropLegacyAssetCode = AirdropAssetCode | "TONKI";
export const AIRDROP_DEFAULT_ASSET: AirdropAssetCode = "USDC";

/** @deprecated Legacy on-chain TONKI asset — removed; maps to USDC for configs. */
const LEGACY_AIRDROP_ASSET_TONKI = "TONKI";

export function normalizeAirdropAssetCode(value: unknown): AirdropAssetCode {
  if (value === "XLM" || value === "USDC") return value;
  return AIRDROP_DEFAULT_ASSET;
}

/** Label for UI/history; preserves legacy TONKI token payouts in old logs. */
export function parseAirdropLogAsset(value: unknown): AirdropLegacyAssetCode {
  if (value === "XLM" || value === "USDC" || value === LEGACY_AIRDROP_ASSET_TONKI) {
    return value;
  }
  return AIRDROP_DEFAULT_ASSET;
}
/** Label for UI/history; preserves legacy TONKI token payouts in old logs. */
export function formatAirdropAssetLabel(value: unknown): string {
  if (value === LEGACY_AIRDROP_ASSET_TONKI) return "TONKI (legacy)";
  if (value === "XLM" || value === "USDC") return value;
  return AIRDROP_DEFAULT_ASSET;
}

/** Circle USDC on Stellar Public Network. */
const USDC_ISSUER_PUBLIC =
  "GA5ZSEJYB37JRC5RJONSTNDBDXKXKVDOOUEFLZXA7GIQQSHATGDFKJ5L";

export type AirdropAssetDefinition = {
  code: AirdropAssetCode;
  /** null = native XLM */
  issuer: string | null;
  label: string;
};

function readIssuer(envKey: string, fallback: string): string {
  const value = process.env[envKey]?.trim();
  return value && value.length > 0 ? value : fallback;
}

export function getAirdropAssetDefinition(
  code: AirdropAssetCode
): AirdropAssetDefinition {
  switch (code) {
    case "XLM":
      return { code: "XLM", issuer: null, label: "XLM (nativo)" };
    case "USDC":
    default:
      return {
        code: "USDC",
        issuer: readIssuer("STELLAR_USDC_ISSUER", USDC_ISSUER_PUBLIC),
        label: "USDC",
      };
  }
}
