import {
  readPollarSecretKey,
  readPollarUsersUrl,
  readPollarVerifyUrl,
} from "src/lib/auth/pollarServer";

export class PollarVerifyError extends Error {
  constructor(
    readonly reason:
      | "missing_secret"
      | "invalid_token"
      | "wrong_app"
      | "bad_api_key"
      | "verify_failed"
      | "profile_invalid"
  ) {
    super(reason);
    this.name = "PollarVerifyError";
  }
}

export type VerifiedPollarIdentity = {
  pollarUserId: string;
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  walletAddress: string | null;
  authProvider: string | null;
};

const STELLAR_ACCOUNT = /^[GC][A-Z2-7]{55}$/;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readString(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

function readWallet(value: unknown): string | null {
  if (typeof value === "string") {
    const address = value.trim();
    return STELLAR_ACCOUNT.test(address) ? address : null;
  }
  const record = asRecord(value);
  if (!record) return null;
  return (
    readWallet(record.address) ??
    readWallet(record.publicKey) ??
    readWallet(record.public_key)
  );
}

function readEmail(profile: Record<string, unknown> | null): string | null {
  if (!profile) return null;
  const direct = readString(profile.email, 255) ?? readString(profile.mail, 255);
  if (direct) return direct;
  const providers = asRecord(profile.providers);
  const emailProvider = asRecord(providers?.email);
  return readString(emailProvider?.address, 255);
}

function readDisplayName(profile: Record<string, unknown> | null): string | null {
  if (!profile) return null;
  const explicit =
    readString(profile.name, 100) ?? readString(profile.displayName, 100);
  if (explicit) return explicit;
  const first =
    readString(profile.firstName, 50) ?? readString(profile.first_name, 50);
  const last =
    readString(profile.lastName, 50) ?? readString(profile.last_name, 50);
  const joined = [first, last].filter(Boolean).join(" ").trim();
  return joined ? joined.slice(0, 100) : null;
}

/** Parses the Pollar `{ success, content }` envelope from `POST /v1/tokens/verify`. */
export function parseVerifiedPollarToken(
  body: unknown
): VerifiedPollarIdentity | null {
  const root = asRecord(body);
  if (!root || root.success === false) return null;
  const content = asRecord(root.content) ?? root;
  const pollarUserId = readString(content.userId, 255);
  if (!pollarUserId) return null;

  const profile = asRecord(content.profile) ?? asRecord(content.data);
  const email = readEmail(profile);
  return {
    pollarUserId,
    email,
    displayName: readDisplayName(profile),
    avatarUrl: readString(profile?.avatar, 2048) ?? readString(profile?.avatar_url, 2048),
    walletAddress: readWallet(content.wallet),
    authProvider: readString(content.authProvider, 50),
  };
}

export async function verifyPollarAccessToken(
  token: string,
  fetchImpl: typeof fetch = fetch
): Promise<VerifiedPollarIdentity> {
  const secret = readPollarSecretKey();
  if (!secret) throw new PollarVerifyError("missing_secret");

  let response: Response;
  try {
    response = await fetchImpl(readPollarVerifyUrl(), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-pollar-api-key": secret,
      },
      body: JSON.stringify({ token }),
    });
  } catch {
    throw new PollarVerifyError("verify_failed");
  }

  const body: unknown = await response.json().catch(() => null);
  const record = asRecord(body);
  const code = typeof record?.code === "string" ? record.code : "";

  if (!response.ok || record?.success === false) {
    if (
      response.status === 401 ||
      code === "SDK_AUTH_TOKEN_EXPIRED" ||
      code === "SDK_AUTH_INVALID_TOKEN"
    ) {
      throw new PollarVerifyError("invalid_token");
    }
    if (code === "SDK_TOKEN_WRONG_APPLICATION" || response.status === 403) {
      throw new PollarVerifyError("wrong_app");
    }
    if (code === "API_KEY_NOT_FOUND") {
      throw new PollarVerifyError("bad_api_key");
    }
    throw new PollarVerifyError("verify_failed");
  }

  const identity = parseVerifiedPollarToken(body);
  if (!identity) throw new PollarVerifyError("profile_invalid");
  return identity;
}

/** Best-effort link so the Pollar dashboard shows Tonki's user id. Never throws. */
export async function registerPollarExternalUser(input: {
  externalId: string;
  email?: string | null;
}): Promise<void> {
  const secret = readPollarSecretKey();
  if (!secret) return;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    await fetch(readPollarUsersUrl(), {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        "x-pollar-api-key": secret,
      },
      body: JSON.stringify({
        externalId: input.externalId,
        ...(input.email ? { email: input.email } : {}),
      }),
    });
  } catch {
    // Login already succeeded locally. A dashboard sync failure is not fatal.
  } finally {
    clearTimeout(timer);
  }
}
