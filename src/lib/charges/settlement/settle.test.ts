import { beforeEach, describe, expect, it, vi } from "vitest";

import { Prisma } from "src/generated/prisma/client";

const prismaMock = vi.hoisted(() => ({
  charge: { findUnique: vi.fn(), updateMany: vi.fn() },
  user: { findUnique: vi.fn() },
}));
const creditChargeForUser = vi.hoisted(() => vi.fn());
const verifyPaymentOnChain = vi.hoisted(() => vi.fn());

vi.mock("src/lib/db", () => ({ default: prismaMock }));
vi.mock("src/lib/charges/creditCharge", () => ({ creditChargeForUser }));
vi.mock("src/lib/charges/settlement/horizon", () => ({ verifyPaymentOnChain }));

import { settleChargePayment } from "./settle";

const token = "abcdefghijklmnopqrstuv";
const hash = "b".repeat(64);
const credited = {
  ok: true as const,
  points: 10,
  establishment_name: "El Campestre",
  total_points: 10,
};

function awaitingCharge(overrides: Record<string, unknown> = {}) {
  return {
    charge_id: "charge-1",
    status: "pending",
    pay_asset_code: "XLM",
    pay_asset_issuer: null,
    pay_amount: new Prisma.Decimal("10.0000000"),
    pay_destination: `G${"B".repeat(55)}`,
    pay_memo: "tonki-0123456789abcdef",
    pay_network: "testnet",
    pay_payer_user_id: "user-1",
    pay_status: "awaiting",
    ...overrides,
  };
}

describe("settleChargePayment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue({
      wallet_address: `G${"C".repeat(55)}`,
    });
    creditChargeForUser.mockResolvedValue(credited);
  });

  it("verifies on-chain, marks the charge paid, then credits once", async () => {
    prismaMock.charge.findUnique.mockResolvedValue(awaitingCharge());
    verifyPaymentOnChain.mockResolvedValue({
      ok: true,
      paid: new Prisma.Decimal("10"),
    });
    prismaMock.charge.updateMany.mockResolvedValue({ count: 1 });

    const result = await settleChargePayment(token, "user-1", hash);

    expect(result).toEqual(credited);
    expect(verifyPaymentOnChain).toHaveBeenCalledWith(
      expect.stringContaining("horizon-testnet"),
      expect.objectContaining({
        hash,
        memo: "tonki-0123456789abcdef",
        asset: { type: "native" },
        payerAddress: `G${"C".repeat(55)}`,
      }),
      undefined
    );
    expect(prismaMock.charge.updateMany).toHaveBeenCalledWith({
      where: {
        charge_id: "charge-1",
        status: "pending",
        pay_status: "awaiting",
        pay_payer_user_id: "user-1",
      },
      data: {
        pay_status: "confirmed",
        pay_tx_hash: hash,
        pay_confirmed_at: expect.any(Date),
      },
    });
    expect(creditChargeForUser).toHaveBeenCalledTimes(1);
  });

  it("does not credit or mark paid when the transfer is underpaid", async () => {
    prismaMock.charge.findUnique.mockResolvedValue(awaitingCharge());
    verifyPaymentOnChain.mockResolvedValue({ ok: false, reason: "underpaid" });

    const result = await settleChargePayment(token, "user-1", hash);

    expect(result).toMatchObject({ ok: false, status: 402 });
    expect(prismaMock.charge.updateMany).not.toHaveBeenCalled();
    expect(creditChargeForUser).not.toHaveBeenCalled();
  });

  it("asks the client to retry while the network has not shown the transfer", async () => {
    prismaMock.charge.findUnique.mockResolvedValue(awaitingCharge());
    verifyPaymentOnChain.mockResolvedValue({ ok: false, reason: "not_found" });

    const result = await settleChargePayment(token, "user-1", hash);

    expect(result).toMatchObject({ ok: false, status: 202, retry: true });
    expect(creditChargeForUser).not.toHaveBeenCalled();
  });

  it("refuses a customer who did not start the payment", async () => {
    prismaMock.charge.findUnique.mockResolvedValue(
      awaitingCharge({ pay_payer_user_id: "user-2" })
    );

    const result = await settleChargePayment(token, "user-1", hash);

    expect(result).toMatchObject({ ok: false, status: 409 });
    expect(verifyPaymentOnChain).not.toHaveBeenCalled();
    expect(creditChargeForUser).not.toHaveBeenCalled();
  });

  it("rejects a malformed hash before calling the network", async () => {
    prismaMock.charge.findUnique.mockResolvedValue(awaitingCharge());

    const result = await settleChargePayment(token, "user-1", "nope");

    expect(result).toMatchObject({ ok: false, status: 400 });
    expect(verifyPaymentOnChain).not.toHaveBeenCalled();
  });

  it("blocks a transaction hash already used for another charge", async () => {
    prismaMock.charge.findUnique.mockResolvedValue(awaitingCharge());
    verifyPaymentOnChain.mockResolvedValue({
      ok: true,
      paid: new Prisma.Decimal("10"),
    });
    prismaMock.charge.updateMany.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("dup", {
        code: "P2002",
        clientVersion: "test",
      })
    );

    const result = await settleChargePayment(token, "user-1", hash);

    expect(result).toMatchObject({ ok: false, status: 409 });
    expect(creditChargeForUser).not.toHaveBeenCalled();
  });

  it("only retries the credit when the payment was already confirmed", async () => {
    prismaMock.charge.findUnique.mockResolvedValue(
      awaitingCharge({ pay_status: "confirmed" })
    );

    const result = await settleChargePayment(token, "user-1", null);

    expect(result).toEqual(credited);
    expect(verifyPaymentOnChain).not.toHaveBeenCalled();
    expect(prismaMock.charge.updateMany).not.toHaveBeenCalled();
    expect(creditChargeForUser).toHaveBeenCalledWith(token, "user-1");
  });
});
