import { describe, expect, it } from "vitest";
import { inspectPollarServerEnv } from "src/lib/auth/pollarServer";
import { parseVerifiedPollarToken } from "src/lib/auth/verifyPollarToken";

describe("inspectPollarServerEnv", () => {
  it("accepts matching testnet key prefixes", () => {
    expect(
      inspectPollarServerEnv({
        publishableKey: "pub_testnet_abc",
        secretKey: "sec_testnet_abc",
        network: "testnet",
      }).ok
    ).toBe(true);
  });

  it("rejects a secret published as a public env var", () => {
    const result = inspectPollarServerEnv({
      publishableKey: "pub_testnet_abc",
      secretKey: "sec_testnet_abc",
      network: "testnet",
      secretExposedAsPublic: true,
    });
    expect(result.ok).toBe(false);
    expect(result.issues).toContain("secret_key_exposed");
  });

  it("rejects missing keys and mainnet prefixes on a testnet app", () => {
    const result = inspectPollarServerEnv({
      publishableKey: "pub_mainnet_abc",
      secretKey: "",
      network: "testnet",
    });
    expect(result.issues).toEqual([
      "publishable_key_prefix",
      "missing_secret_key",
    ]);
  });
});

describe("parseVerifiedPollarToken", () => {
  const wallet = `${"G"}${"A".repeat(55)}`;

  it("reads the documented verify envelope", () => {
    expect(wallet).toHaveLength(56);
    expect(
      parseVerifiedPollarToken({
        success: true,
        code: "SERVER_TOKEN_VERIFIED",
        content: {
          userId: "pollar-user-1",
          authProvider: "google",
          wallet,
          profile: {
            email: "Admin@Tonki.io",
            name: "Admin Tonki",
            avatar: "https://example.com/a.png",
          },
        },
      })
    ).toEqual({
      pollarUserId: "pollar-user-1",
      email: "Admin@Tonki.io",
      displayName: "Admin Tonki",
      avatarUrl: "https://example.com/a.png",
      walletAddress: wallet,
      authProvider: "google",
    });
  });

  it("accepts wallet.publicKey and profile.mail", () => {
    expect(
      parseVerifiedPollarToken({
        success: true,
        content: {
          userId: "pollar-user-2",
          wallet: { publicKey: wallet },
          profile: { mail: "otp@example.com", first_name: "Ada", last_name: "Lovelace" },
        },
      })
    ).toMatchObject({
      pollarUserId: "pollar-user-2",
      email: "otp@example.com",
      displayName: "Ada Lovelace",
      walletAddress: wallet,
    });
  });

  it("rejects a failed envelope and a body without userId", () => {
    expect(parseVerifiedPollarToken({ success: false, code: "SDK_AUTH_INVALID_TOKEN" })).toBeNull();
    expect(parseVerifiedPollarToken({ success: true, content: { wallet } })).toBeNull();
    expect(
      parseVerifiedPollarToken({
        success: true,
        content: { userId: "pollar-user-3", wallet: "not-a-stellar-key" },
      })?.walletAddress
    ).toBeNull();
  });
});
