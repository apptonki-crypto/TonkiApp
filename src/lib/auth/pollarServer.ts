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

