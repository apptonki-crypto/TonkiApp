import { beforeEach, describe, expect, it, vi } from "vitest";

import { Prisma } from "src/generated/prisma/client";

const prismaMock = vi.hoisted(() => ({
  charge: { findUnique: vi.fn(), updateMany: vi.fn() },
}));

vi.mock("src/lib/db", () => ({ default: prismaMock }));

import {
  parseRampOrderId,
  parseRampOrderState,
  recordRampOrder,
} from "./rampOrder";

const token = "abcdefghijklmnopqrstuv";

function charge(overrides: Record<string, unknown> = {}) {
  return {
    charge_id: "charge-1",
    status: "pending",
    pay_status: "awaiting",
    pay_payer_user_id: "user-1",
    ramp_order_id: null,
    ramp_order_state: null,
    ...overrides,
  };
}

describe("recordRampOrder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.charge.updateMany.mockResolvedValue({ count: 1 });
  });

  it("stores the id and state for the payer while pending", async () => {
    prismaMock.charge.findUnique.mockResolvedValue(charge());
    const result = await recordRampOrder(token, "user-1", {
      orderId: "ord_123",
      state: "Pending",
    });
    expect(result).toEqual({ ok: true });
    expect(prismaMock.charge.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ pay_payer_user_id: "user-1" }),
        data: { ramp_order_id: "ord_123", ramp_order_state: "pending" },
      })
    );
  });

  it("refuses anyone who did not lock the payment", async () => {
    prismaMock.charge.findUnique.mockResolvedValue(
      charge({ pay_payer_user_id: "user-2" })
    );
    const result = await recordRampOrder(token, "user-1", {
      orderId: "ord_123",
      state: "pending",
    });
    expect(result).toMatchObject({ ok: false, status: 409 });
    expect(prismaMock.charge.updateMany).not.toHaveBeenCalled();
  });

  it("refuses once the charge is paid or credited", async () => {
    prismaMock.charge.findUnique.mockResolvedValue(
      charge({ pay_status: "confirmed" })
    );
    expect(
      await recordRampOrder(token, "user-1", { orderId: "o1", state: "pending" })
    ).toMatchObject({ ok: false, status: 409 });
    prismaMock.charge.findUnique.mockResolvedValue(
      charge({ status: "credited" })
    );
    expect(
      await recordRampOrder(token, "user-1", { orderId: "o1", state: "pending" })
    ).toMatchObject({ ok: false, status: 409 });
    expect(prismaMock.charge.updateMany).not.toHaveBeenCalled();
  });

  it("does not overwrite an active order with a different one", async () => {
    prismaMock.charge.findUnique.mockResolvedValue(
      charge({ ramp_order_id: "ord_old", ramp_order_state: "pending" })
    );
    expect(
      await recordRampOrder(token, "user-1", { orderId: "ord_new", state: "pending" })
    ).toMatchObject({ ok: false, status: 409 });
  });

  it("lets a failed order be replaced and the same order be updated", async () => {
    prismaMock.charge.findUnique.mockResolvedValue(
      charge({ ramp_order_id: "ord_old", ramp_order_state: "failed" })
    );
    expect(
      await recordRampOrder(token, "user-1", { orderId: "ord_new", state: "pending" })
    ).toEqual({ ok: true });
    prismaMock.charge.findUnique.mockResolvedValue(
      charge({ ramp_order_id: "ord_old", ramp_order_state: "pending" })
    );
    expect(
      await recordRampOrder(token, "user-1", { orderId: "ord_old", state: "completed" })
    ).toEqual({ ok: true });
  });

  it("rejects malformed input before touching the database", async () => {
    expect(
      await recordRampOrder(token, "user-1", { orderId: "bad id!", state: "pending" })
    ).toMatchObject({ ok: false, status: 400 });
    expect(
      await recordRampOrder(token, "user-1", { orderId: "ord", state: "<script>" })
    ).toMatchObject({ ok: false, status: 400 });
    expect(
      await recordRampOrder("short", "user-1", { orderId: "ord", state: "pending" })
    ).toMatchObject({ ok: false, status: 404 });
    expect(prismaMock.charge.findUnique).not.toHaveBeenCalled();
  });

  it("maps a duplicate order id to a conflict", async () => {
    prismaMock.charge.findUnique.mockResolvedValue(charge());
    prismaMock.charge.updateMany.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("dup", {
        code: "P2002",
        clientVersion: "test",
      })
    );
    expect(
      await recordRampOrder(token, "user-1", { orderId: "ord_1", state: "pending" })
    ).toMatchObject({ ok: false, status: 409 });
  });
});

describe("parsers", () => {
  it("validates order ids and states", () => {
    expect(parseRampOrderId(" ord-1_A ")).toBe("ord-1_A");
    expect(parseRampOrderId("a".repeat(65))).toBeNull();
    expect(parseRampOrderId(42)).toBeNull();
    expect(parseRampOrderState("Pending_Fiat")).toBe("pending_fiat");
    expect(parseRampOrderState("a".repeat(21))).toBeNull();
  });
});
