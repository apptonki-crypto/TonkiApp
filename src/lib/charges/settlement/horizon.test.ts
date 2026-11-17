import { describe, expect, it, vi } from "vitest";

import { Prisma } from "src/generated/prisma/client";

import { verifyPaymentOnChain, type ExpectedPayment } from "./horizon";

const HORIZON = "https://horizon-testnet.stellar.org";
const BUSINESS = `G${"B".repeat(55)}`;
const PAYER = `G${"C".repeat(55)}`;
const hash = "a".repeat(64);

const expected: ExpectedPayment = {
  hash,
  destination: BUSINESS,
  memo: "tonki-0123456789abcdef",
  asset: { type: "native" },
  minAmount: new Prisma.Decimal("10.0000000"),
  payerAddress: PAYER,
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

function horizon(
  tx: unknown,
  records: unknown[],
  txStatus = 200
): typeof fetch {
  return vi.fn(async (url: string | URL | Request) => {
    const href = String(url);
    if (href.includes("/payments")) {
      return json({ _embedded: { records } });
    }
    return json(tx, txStatus);
  }) as unknown as typeof fetch;
}

const goodTx = {
  successful: true,
  memo_type: "text",
  memo: "tonki-0123456789abcdef",
};

function payment(overrides: Record<string, unknown> = {}) {
  return {
    type: "payment",
    from: PAYER,
    to: BUSINESS,
    asset_type: "native",
    amount: "10.0000000",
    ...overrides,
  };
}

describe("verifyPaymentOnChain", () => {
  it("accepts a successful transfer with the memo, asset and amount", async () => {
    const result = await verifyPaymentOnChain(
      HORIZON,
      expected,
      horizon(goodTx, [payment({ amount: "10.5000000" })])
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.paid.toFixed(7)).toBe("10.5000000");
  });

  it("asks the client to retry while the network does not know the hash", async () => {
    const result = await verifyPaymentOnChain(
      HORIZON,
      expected,
      horizon({}, [], 404)
    );
    expect(result).toEqual({ ok: false, reason: "not_found" });
  });

  it("rejects a failed transaction and a memo for another charge", async () => {
    expect(
      await verifyPaymentOnChain(
        HORIZON,
        expected,
        horizon({ ...goodTx, successful: false }, [payment()])
      )
    ).toEqual({ ok: false, reason: "failed" });
    expect(
      await verifyPaymentOnChain(
        HORIZON,
        expected,
        horizon({ ...goodTx, memo: "tonki-other" }, [payment()])
      )
    ).toEqual({ ok: false, reason: "memo_mismatch" });
  });

  it("rejects the wrong destination, asset or sender", async () => {
    const cases = [
      payment({ to: PAYER }),
      payment({ asset_type: "credit_alphanum4", asset_code: "USDC", asset_issuer: BUSINESS }),
      payment({ from: BUSINESS }),
    ];
    for (const record of cases) {
      expect(
        await verifyPaymentOnChain(HORIZON, expected, horizon(goodTx, [record]))
      ).toEqual({ ok: false, reason: "no_matching_payment" });
    }
  });

  it("rejects an underpayment", async () => {
    expect(
      await verifyPaymentOnChain(
        HORIZON,
        expected,
        horizon(goodTx, [payment({ amount: "9.9999999" })])
      )
    ).toEqual({ ok: false, reason: "underpaid" });
  });

  it("matches an issued asset by code and issuer", async () => {
    const issuer = `G${"D".repeat(55)}`;
    const result = await verifyPaymentOnChain(
      HORIZON,
      { ...expected, asset: { type: "credit_alphanum4", code: "USDC", issuer } },
      horizon(goodTx, [
        payment({ asset_type: "credit_alphanum4", asset_code: "USDC", asset_issuer: issuer }),
      ])
    );
    expect(result.ok).toBe(true);
  });

  it("reports unavailable when Horizon cannot be reached", async () => {
    const down = vi.fn(async () => {
      throw new Error("network");
    }) as unknown as typeof fetch;
    expect(await verifyPaymentOnChain(HORIZON, expected, down)).toEqual({
      ok: false,
      reason: "unavailable",
    });
  });
});
