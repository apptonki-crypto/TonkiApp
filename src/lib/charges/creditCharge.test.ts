import { beforeEach, describe, expect, it, vi } from "vitest";

import { Prisma } from "src/generated/prisma/client";

const prismaMock = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  $transaction: vi.fn(),
}));

const applyConsumptionForCreditedCharge = vi.hoisted(() => vi.fn());

vi.mock("src/lib/db", () => ({
  default: prismaMock,
}));

vi.mock("src/lib/posts/dynamics", () => ({
  applyConsumptionForCreditedCharge,
}));

import { creditChargeForUser } from "./creditCharge";

const token = "abcdefghijklmnopqrstuv";

function pendingCharge(overrides: Record<string, unknown> = {}) {
  return {
    charge_id: "charge-1",
    establishment_id: "est-1",
    admin_id: "admin-1",
    amount: new Prisma.Decimal("200.00"),
    cashback_percent: 5,
    expires_at: new Date(Date.now() + 60_000),
    status: "pending",
    claimed_by_user_id: null,
    pay_status: "confirmed",
    pay_payer_user_id: "user-1",
    establishment: { name: "El Campestre" },
    ...overrides,
  };
}

describe("creditChargeForUser", () => {
  const tx = {
    charge: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
    },
    reward: {
      create: vi.fn(),
      aggregate: vi.fn(),
    },
    prizeRedemption: {
      aggregate: vi.fn(),
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$transaction.mockImplementation(async (fn: (client: typeof tx) => unknown) =>
      fn(tx)
    );
    prismaMock.user.findUnique.mockResolvedValue({
      user_id: "user-1",
      type: "user",
      status: "active",
    });
    tx.prizeRedemption.aggregate.mockResolvedValue({ _sum: { points: 0 } });
  });

  it("rejects an admin before writing a reward", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      user_id: "admin-1",
      type: "admin",
      status: "active",
    });

    const result = await creditChargeForUser(token, "admin-1");

    expect(result).toMatchObject({ ok: false, status: 403 });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(applyConsumptionForCreditedCharge).not.toHaveBeenCalled();
  });

  it("does not credit while the payment is unconfirmed", async () => {
    tx.charge.findUnique.mockResolvedValue(
      pendingCharge({ pay_status: "awaiting" })
    );

    const result = await creditChargeForUser(token, "user-1");

    expect(result).toMatchObject({ ok: false, status: 402 });
    expect(tx.charge.updateMany).not.toHaveBeenCalled();
    expect(tx.reward.create).not.toHaveBeenCalled();
    expect(applyConsumptionForCreditedCharge).not.toHaveBeenCalled();
  });

  it("does not credit a customer who did not pay the charge", async () => {
    tx.charge.findUnique.mockResolvedValue(
      pendingCharge({ pay_payer_user_id: "user-2" })
    );

    const result = await creditChargeForUser(token, "user-1");

    expect(result).toMatchObject({ ok: false, status: 402 });
    expect(tx.reward.create).not.toHaveBeenCalled();
  });

  it("credits a confirmed payment even after the code expired", async () => {
    tx.charge.findUnique.mockResolvedValue(
      pendingCharge({ expires_at: new Date(Date.now() - 60_000) })
    );
    tx.charge.updateMany.mockResolvedValue({ count: 1 });
    tx.reward.create.mockResolvedValue({ reward_id: "reward-1" });
    tx.reward.aggregate.mockResolvedValue({ _sum: { points: 10 } });

    const result = await creditChargeForUser(token, "user-1");

    expect(result).toMatchObject({ ok: true, points: 10 });
    expect(applyConsumptionForCreditedCharge).toHaveBeenCalledTimes(1);
  });

  it("rejects zero Tonkis without marking the token used", async () => {
    tx.charge.findUnique.mockResolvedValue(
      pendingCharge({ amount: new Prisma.Decimal("1.00"), cashback_percent: 1 })
    );

    const result = await creditChargeForUser(token, "user-1");

    expect(result).toMatchObject({
      ok: false,
      status: 400,
      error: "Este consumo no alcanza para acreditar Tonkis.",
    });
    expect(tx.charge.updateMany).not.toHaveBeenCalled();
    expect(tx.reward.create).not.toHaveBeenCalled();
    expect(applyConsumptionForCreditedCharge).not.toHaveBeenCalled();
  });

  it("credits rounded Tonkis once and stores them on a reward", async () => {
    tx.charge.findUnique.mockResolvedValue(pendingCharge());
    tx.charge.updateMany.mockResolvedValue({ count: 1 });
    tx.reward.create.mockResolvedValue({ reward_id: "reward-1" });
    tx.reward.aggregate.mockResolvedValue({ _sum: { points: 10 } });

    const result = await creditChargeForUser(token, "user-1");

    expect(result).toEqual({
      ok: true,
      points: 10,
      establishment_name: "El Campestre",
      total_points: 10,
    });
    expect(tx.charge.updateMany).toHaveBeenCalledWith({
      where: {
        charge_id: "charge-1",
        status: "pending",
        pay_status: "confirmed",
        pay_payer_user_id: "user-1",
      },
      data: {
        status: "credited",
        claimed_by_user_id: "user-1",
      },
    });
    expect(tx.reward.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        user_id: "user-1",
        establishment_id: "est-1",
        points: 10,
        description: expect.stringContaining("pagados"),
      }),
    });
    expect(tx.charge.update).toHaveBeenCalledWith({
      where: { charge_id: "charge-1" },
      data: { reward_id: "reward-1" },
    });
    expect(applyConsumptionForCreditedCharge).toHaveBeenCalledTimes(1);
    expect(applyConsumptionForCreditedCharge).toHaveBeenCalledWith(tx, {
      chargeId: "charge-1",
      establishmentId: "est-1",
      userId: "user-1",
      amount: expect.any(Prisma.Decimal),
    });
  });

  it("reports the spendable balance when a redemption already holds Tonkis", async () => {
    tx.charge.findUnique.mockResolvedValue(pendingCharge());
    tx.charge.updateMany.mockResolvedValue({ count: 1 });
    tx.reward.create.mockResolvedValue({ reward_id: "reward-1" });
    tx.reward.aggregate.mockResolvedValue({ _sum: { points: 50 } });
    tx.prizeRedemption.aggregate.mockResolvedValue({ _sum: { points: 40 } });

    const result = await creditChargeForUser(token, "user-1");

    expect(result).toMatchObject({ ok: true, points: 10, total_points: 10 });
  });

  it("does not create a second reward when the token was just claimed", async () => {
    tx.charge.findUnique
      .mockResolvedValueOnce(pendingCharge())
      .mockResolvedValueOnce({ status: "credited" });
    tx.charge.updateMany.mockResolvedValue({ count: 0 });

    const result = await creditChargeForUser(token, "user-1");

    expect(result).toMatchObject({
      ok: false,
      status: 409,
      error: "Este código ya acreditó Tonkis.",
    });
    expect(tx.reward.create).not.toHaveBeenCalled();
    expect(applyConsumptionForCreditedCharge).not.toHaveBeenCalled();
  });
});
