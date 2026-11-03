export const POLLAR_PROVIDER = "pollar";

const DEFAULT_VERIFY_URL = "https://server.api.pollar.xyz/v1/tokens/verify";
const DEFAULT_USERS_URL = "https://server.api.pollar.xyz/v1/users";

export function readPollarSecretKey(): string | null {
  const key = process.env.POLLAR_SECRET_KEY?.trim();
  return key ? key : null;
}

export function readPollarVerifyUrl(): string {
  const override = process.env.POLLAR_TOKEN_VERIFY_URL?.trim();
  return override || DEFAULT_VERIFY_URL;
}

export function readPollarUsersUrl(): string {
  const override = process.env.POLLAR_USERS_URL?.trim();
  return override || DEFAULT_USERS_URL;
}

export type PollarEnvIssue =
  | "missing_publishable_key"
  | "missing_secret_key"
  | "publishable_key_prefix"
  | "secret_key_prefix"
  | "secret_key_exposed";

/**
 * Local readiness check. Dashboard items (allowed domains, Immediate funding,
 * XLM in the funding wallet) cannot be confirmed from this repo.
 */
export function inspectPollarServerEnv(input?: {
  publishableKey?: string | null;
  secretKey?: string | null;
  network?: "testnet" | "mainnet";
  secretExposedAsPublic?: boolean;
}): { ok: boolean; issues: PollarEnvIssue[] } {
  const publishableKey = input?.publishableKey ?? null;
  const secretKey = input?.secretKey ?? null;
  const network = input?.network ?? "testnet";
  const issues: PollarEnvIssue[] = [];

  if (!publishableKey) issues.push("missing_publishable_key");
  else if (!publishableKey.startsWith(`pub_${network}_`)) {
    issues.push("publishable_key_prefix");
  }

  if (!secretKey) issues.push("missing_secret_key");
  else if (!secretKey.startsWith(`sec_${network}_`)) {
    issues.push("secret_key_prefix");
  }

  if (input?.secretExposedAsPublic) issues.push("secret_key_exposed");

  return { ok: issues.length === 0, issues };
}
