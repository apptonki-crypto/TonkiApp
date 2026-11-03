import { beforeEach, describe, expect, it, vi } from "vitest";

import { Prisma } from "src/generated/prisma/client";

const prismaMock = vi.hoisted(() => ({
  establishment: { findFirst: vi.fn() },
  product: { findMany: vi.fn() },
  charge: { create: vi.fn() },
}));

vi.mock("src/lib/db", () => ({
  default: prismaMock,
}));

vi.mock("src/lib/charges/chargeQr", () => ({
  renderChargeQrDataUrl: vi.fn(async (url: string) => `data:image/png,${url}`),
}));

import { createConsumptionCharge } from "./createCharge";

const PRODUCT_A = "11111111-1111-4111-8111-111111111111";
const PRODUCT_B = "22222222-2222-4222-8222-222222222222";

describe("createConsumptionCharge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.establishment.findFirst.mockResolvedValue({
      establishment_id: "est-1",
      cashback_percent: 5,
    });
    prismaMock.charge.create.mockResolvedValue({ charge_id: "charge-1" });
  });

  it("registers an amount-only sale as pending without product lines", async () => {
    const result = await createConsumptionCharge({
      adminId: "admin-1",
      amountRaw: "150.00",
      origin: "https://tonki.test",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.charge.amount).toBe("150.00");
    expect(result.charge.points).toBeGreaterThan(0);
    expect(prismaMock.product.findMany).not.toHaveBeenCalled();

    const created = prismaMock.charge.create.mock.calls[0][0].data;
    expect(created.status).toBe("pending");
    expect(created.amount).toEqual(new Prisma.Decimal("150.00"));
    expect(created.line_items).toBeUndefined();
  });

  it("rejects a sale with neither amount nor products", async () => {
    const result = await createConsumptionCharge({
      adminId: "admin-1",
      amountRaw: null,
      origin: "https://tonki.test",
    });

    expect(result).toMatchObject({
      ok: false,
      status: 400,
    });
    expect(prismaMock.charge.create).not.toHaveBeenCalled();
  });

  it("builds the amount from catalog lines and stores a snapshot", async () => {
    prismaMock.product.findMany.mockResolvedValue([
      {
        product_id: PRODUCT_A,
        name: "Café",
        unit_price: new Prisma.Decimal("45.00"),
      },
      {
        product_id: PRODUCT_B,
        name: "Pan",
        unit_price: new Prisma.Decimal("20.00"),
      },
    ]);

    const result = await createConsumptionCharge({
      adminId: "admin-1",
      amountRaw: null,
      origin: "https://tonki.test",
      items: [
        { product_id: PRODUCT_A, quantity: 2 },
        { product_id: PRODUCT_B, quantity: 1 },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.charge.amount).toBe("110.00");

    const created = prismaMock.charge.create.mock.calls[0][0].data;
    expect(created.line_items.create).toEqual([
      {
        product_id: PRODUCT_A,
        product_name: "Café",
        quantity: 2,
        unit_price: new Prisma.Decimal("45.00"),
      },
      {
        product_id: PRODUCT_B,
        product_name: "Pan",
        quantity: 1,
        unit_price: new Prisma.Decimal("20.00"),
      },
    ]);
  });

  it("rejects inactive or unknown products", async () => {
    prismaMock.product.findMany.mockResolvedValue([]);

    const result = await createConsumptionCharge({
      adminId: "admin-1",
      amountRaw: null,
      origin: "https://tonki.test",
      items: [{ product_id: PRODUCT_A, quantity: 1 }],
    });

    expect(result).toMatchObject({
      ok: false,
      status: 400,
      error: "Uno o más productos no existen o están inactivos",
    });
    expect(prismaMock.charge.create).not.toHaveBeenCalled();
  });
});
