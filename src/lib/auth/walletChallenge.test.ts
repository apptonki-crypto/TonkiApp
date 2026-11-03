import { describe, expect, it } from "vitest";
import { NextResponse } from "next/server";
import {
  WALLET_NONCE_COOKIE,
  clearWalletNonceCookie,
  generateWalletNonce,
} from "src/lib/auth/walletChallenge";

describe("wallet challenge helpers", () => {
  it("generates a 32-character hex nonce", () => {
    const nonce = generateWalletNonce();
    expect(nonce).toMatch(/^[0-9a-f]{32}$/);
  });

  it("clears the nonce cookie after use", () => {
    const res = NextResponse.json({});
    clearWalletNonceCookie(res);
    const cleared = res.cookies.get(WALLET_NONCE_COOKIE);

    expect(cleared?.value).toBe("");
    expect(cleared?.maxAge).toBe(0);
  });
});
