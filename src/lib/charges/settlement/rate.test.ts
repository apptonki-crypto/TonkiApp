import { afterEach, describe, expect, it, vi } from "vitest";

import { Prisma } from "src/generated/prisma/client";

import { parseSettlementAsset } from "./config";
import {
  RateUnavailableError,
  assetAmountForPesos,
  formatAssetAmount,
  readMxnPerAsset,
} from "./rate";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("assetAmountForPesos", () => {
  it("rounds up to 7 decimals so the business is never short", () => {
    const amount = assetAmountForPesos("100.00", new Prisma.Decimal("3"));
    expect(formatAssetAmount(amount)).toBe("33.3333334");
  });

  it("is exact when the division is exact", () => {
    const amount = assetAmountForPesos("200.00", new Prisma.Decimal("4"));
    expect(formatAssetAmount(amount)).toBe("50.0000000");
  });
});

describe("readMxnPerAsset", () => {
  it("prefers the pinned PAYMENT_MXN_PER_ASSET", async () => {
    vi.stubEnv("PAYMENT_MXN_PER_ASSET", "2.5");
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const rate = await readMxnPerAsset({ type: "native" }, fetchImpl);
    expect(rate.toString()).toBe("2.5");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("reads the XLM price in pesos from the price API", async () => {
    vi.stubEnv("PAYMENT_MXN_PER_ASSET", "");
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify({ stellar: { mxn: 2.1 } }))
    ) as unknown as typeof fetch;
    const rate = await readMxnPerAsset({ type: "native" }, fetchImpl, 1_000_000);
    expect(rate.toString()).toBe("2.1");
  });

  it("fails closed when the price is unavailable or the asset has no source", async () => {
    vi.stubEnv("PAYMENT_MXN_PER_ASSET", "");
    const bad = vi.fn(async () => new Response("no", { status: 500 })) as unknown as typeof fetch;
    await expect(
      readMxnPerAsset({ type: "native" }, bad, 9_000_000)
    ).rejects.toBeInstanceOf(RateUnavailableError);
    await expect(
      readMxnPerAsset(
        { type: "credit_alphanum12", code: "TONKIPAY", issuer: `G${"A".repeat(55)}` },
        bad
      )
    ).rejects.toBeInstanceOf(RateUnavailableError);
  });
});

describe("parseSettlementAsset", () => {
  it("defaults to native XLM and parses CODE:ISSUER", () => {
    const issuer = `G${"A".repeat(55)}`;
    expect(parseSettlementAsset(undefined)).toEqual({ type: "native" });
    expect(parseSettlementAsset("XLM")).toEqual({ type: "native" });
    expect(parseSettlementAsset(`USDC:${issuer}`)).toEqual({
      type: "credit_alphanum4",
      code: "USDC",
      issuer,
    });
  });

  it("rejects a malformed asset instead of guessing", () => {
    expect(() => parseSettlementAsset("USDC")).toThrow();
    expect(() => parseSettlementAsset("USDC:not-an-issuer")).toThrow();
  });
});
