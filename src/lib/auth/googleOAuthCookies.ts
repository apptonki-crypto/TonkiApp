import type { NextResponse } from "next/server";
import { cookies } from "next/headers";

const GOOGLE_OAUTH_STATE_COOKIE = "tonki_google_oauth_state";
const GOOGLE_OAUTH_NONCE_COOKIE = "tonki_google_oauth_nonce";
const GOOGLE_OAUTH_CODE_VERIFIER_COOKIE = "tonki_google_oauth_code_verifier";
const GOOGLE_OAUTH_RETURN_TO_COOKIE = "tonki_google_oauth_return_to";

const cookieBase = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  secure: process.env.NODE_ENV === "production",
};

type GoogleOAuthCookiePayload = {
  state: string;
  nonce: string;
  codeVerifier: string;
  returnTo: string | null;
};

/** Legacy cookie-based OAuth session (pre signed-state). */
export async function readGoogleOAuthCookies(): Promise<GoogleOAuthCookiePayload | null> {
  const jar = await cookies();
  const state = jar.get(GOOGLE_OAUTH_STATE_COOKIE)?.value?.trim() ?? "";
  const nonce = jar.get(GOOGLE_OAUTH_NONCE_COOKIE)?.value?.trim() ?? "";
  const codeVerifier =
    jar.get(GOOGLE_OAUTH_CODE_VERIFIER_COOKIE)?.value?.trim() ?? "";
  const returnTo =
    jar.get(GOOGLE_OAUTH_RETURN_TO_COOKIE)?.value?.trim() || null;

  if (!state || !nonce || !codeVerifier) return null;
  return { state, nonce, codeVerifier, returnTo };
}

export function clearGoogleOAuthCookies(res: NextResponse): void {
  const opts = { ...cookieBase, maxAge: 0 };
  res.cookies.set(GOOGLE_OAUTH_STATE_COOKIE, "", opts);
  res.cookies.set(GOOGLE_OAUTH_NONCE_COOKIE, "", opts);
  res.cookies.set(GOOGLE_OAUTH_CODE_VERIFIER_COOKIE, "", opts);
  res.cookies.set(GOOGLE_OAUTH_RETURN_TO_COOKIE, "", opts);
}
