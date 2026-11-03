import { beforeEach, describe, expect, it, vi } from "vitest";

import { Prisma } from "src/generated/prisma/client";
import {
  CHARGE_STATUS_CREDITED,
  CHARGE_STATUS_PENDING,
} from "src/lib/charges/constants";

const prismaMock = vi.hoisted(() => ({
  establishment: { findFirst: vi.fn() },
  charge: { findMany: vi.fn() },
  product: { count: vi.fn() },
}));

vi.mock("src/lib/db", () => ({
  default: prismaMock,
}));

import { loadCrmExportCsv, loadCrmOverview } from "./loadCrmOverview";

const FIXED = new Date("2026-10-25T18:00:00.000Z");

function sale(overrides: Record<string, unknown> = {}) {
  return {
    charge_id: "charge-1",
    amount: new Prisma.Decimal("200.00"),
    status: CHARGE_STATUS_PENDING,
    cashback_percent: 5,
    created_at: FIXED,
    updated_at: FIXED,
    claimed_by: null,
    line_items: [],
    ...overrides,
  };
}

describe("loadCrmOverview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.establishment.findFirst.mockResolvedValue({
      establishment_id: "est-1",
      name: "El Campestre",
      cashback_percent: 5,
    });
    prismaMock.product.count.mockResolvedValue(0);
    prismaMock.charge.findMany.mockResolvedValue([]);
  });

  it("keeps an amount-only pending sale out of confirmed revenue", async () => {
    const confirmed = await loadCrmOverview("admin-1", { now: FIXED });

    expect(confirmed.ok).toBe(true);
    if (!confirmed.ok) return;
    expect(confirmed.payload.summary).toMatchObject({
      sales_count: 0,
      revenue: "0.00",
      average_ticket: "0.00",
      active_products_count: 0,
    });
    expect(confirmed.payload.recent_sales).toEqual([]);
    expect(confirmed.payload.series.by_product).toEqual([]);
    expect(prismaMock.charge.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          establishment_id: "est-1",
          status: CHARGE_STATUS_CREDITED,
          created_at: {
            gte: new Date("2026-09-26T06:00:00.000Z"),
            lt: new Date("2026-10-26T06:00:00.000Z"),
          },
        },
      })
    );

    prismaMock.charge.findMany.mockResolvedValue([sale()]);
    const pending = await loadCrmOverview("admin-1", {
      now: FIXED,
      status: "pending",
    });
    expect(pending.ok).toBe(true);
    if (!pending.ok) return;
    expect(pending.payload.summary).toMatchObject({
      sales_count: 1,
      revenue: "200.00",
      average_ticket: "200.00",
    });
    expect(pending.payload.recent_sales[0]).toMatchObject({
      amount: "200.00",
      status: CHARGE_STATUS_PENDING,
      line_items: [],
    });
    expect(pending.payload.series.by_product).toEqual([
      {
        product_id: "sin-producto",
        product_name: "Sin producto",
        units_sold: 1,
        revenue: "200.00",
      },
    ]);
    expect(prismaMock.charge.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: CHARGE_STATUS_PENDING }),
      })
    );
  });

  it("counts credited amount sales in revenue and average ticket", async () => {
    prismaMock.charge.findMany.mockResolvedValue([
      sale({
        charge_id: "credited-1",
        amount: new Prisma.Decimal("150.00"),
        status: CHARGE_STATUS_CREDITED,
        claimed_by: { name: "Ana" },
      }),
      sale({
        charge_id: "credited-2",
        amount: new Prisma.Decimal("200.00"),
        status: CHARGE_STATUS_CREDITED,
      }),
    ]);

    const result = await loadCrmOverview("admin-1", { now: FIXED });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.summary).toMatchObject({
      sales_count: 2,
      revenue: "350.00",
      average_ticket: "175.00",
    });
    expect(result.payload.filter).toEqual({
      preset: "30d",
      status: "credited",
      from: "2026-09-26",
      to: "2026-10-25",
      time_zone: "America/Mexico_City",
    });
    expect(result.payload.recent_sales[0]?.claimed_by_name).toBe("Ana");
    expect(result.payload.series.by_product).toEqual([
      {
        product_id: "sin-producto",
        product_name: "Sin producto",
        units_sold: 2,
        revenue: "350.00",
      },
    ]);
    expect(result.payload.series.by_day).toHaveLength(30);
    expect(result.payload.series.by_day[0]).toMatchObject({
      date: "2026-09-26",
      sales_count: 0,
      revenue: "0.00",
    });
    expect(result.payload.series.by_day[29]).toMatchObject({
      date: "2026-10-25",
      sales_count: 2,
      revenue: "350.00",
    });
    expect(result.payload.series.by_hour[12]).toMatchObject({
      hour: 12,
      sales_count: 2,
      revenue: "350.00",
    });
    expect(result.payload.series.hours_by_day).toHaveLength(30);
    expect(result.payload.series.hours_by_day[29]?.hours[12]).toMatchObject({
      label: "12:00",
      sales_count: 2,
      revenue: "350.00",
    });
    expect(result.payload.series.hours_by_day[28]?.hours[12]?.sales_count).toBe(0);
    expect(result.payload.series.by_weekday[6]?.sales_count).toBe(2);
  });

  it("ranks product lines on the filtered charges and keeps amount-only revenue", async () => {
    prismaMock.product.count.mockResolvedValue(2);
    prismaMock.charge.findMany.mockResolvedValue([
      sale({
        charge_id: "with-lines",
        status: CHARGE_STATUS_CREDITED,
        amount: new Prisma.Decimal("110.00"),
        line_items: [
          {
            line_item_id: "line-1",
            product_id: "prod-cafe",
            product_name: "Café",
            quantity: 2,
            unit_price: new Prisma.Decimal("45.00"),
          },
          {
            line_item_id: "line-2",
            product_id: "prod-pan",
            product_name: "Pan",
            quantity: 1,
            unit_price: new Prisma.Decimal("20.00"),
          },
        ],
      }),
      sale({
        charge_id: "amount-only",
        status: CHARGE_STATUS_CREDITED,
        amount: new Prisma.Decimal("40.00"),
        line_items: [],
      }),
    ]);

    const result = await loadCrmOverview("admin-1", { now: FIXED });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.summary).toMatchObject({
      sales_count: 2,
      revenue: "150.00",
      average_ticket: "75.00",
      active_products_count: 2,
    });
    expect(result.payload.series.by_product).toEqual([
      {
        product_id: "prod-cafe",
        product_name: "Café",
        units_sold: 2,
        revenue: "90.00",
      },
      {
        product_id: "sin-producto",
        product_name: "Sin producto",
        units_sold: 1,
        revenue: "40.00",
      },
      {
        product_id: "prod-pan",
        product_name: "Pan",
        units_sold: 1,
        revenue: "20.00",
      },
    ]);
    expect(result.payload.recent_sales[0]?.line_items[0]).toMatchObject({
      product_name: "Café",
      quantity: 2,
      line_total: "90.00",
    });
    expect(prismaMock.charge.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: CHARGE_STATUS_CREDITED }),
      })
    );
  });

  it("caps the on-screen list without dropping revenue from the series", async () => {
    prismaMock.charge.findMany.mockResolvedValue([
      sale({
        charge_id: "c-1",
        status: CHARGE_STATUS_CREDITED,
        amount: new Prisma.Decimal("10.00"),
      }),
      sale({
        charge_id: "c-2",
        status: CHARGE_STATUS_CREDITED,
        amount: new Prisma.Decimal("10.00"),
      }),
      sale({
        charge_id: "c-3",
        status: CHARGE_STATUS_CREDITED,
        amount: new Prisma.Decimal("10.00"),
      }),
    ]);

    const overview = await loadCrmOverview("admin-1", {
      now: FIXED,
      salesLimit: 1,
    });
    const exported = await loadCrmExportCsv("admin-1", { now: FIXED });

    expect(overview.ok).toBe(true);
    if (!overview.ok) return;
    expect(overview.payload.recent_sales).toHaveLength(1);
    expect(overview.payload.sales_truncated).toBe(true);
    expect(overview.payload.summary).toMatchObject({
      sales_count: 3,
      revenue: "30.00",
    });

    expect(exported.ok).toBe(true);
    if (!exported.ok) return;
    expect(exported.filename).toBe("ventas-2026-09-26-a-2026-10-25.csv");
    const lines = exported.csv.replace(/^\uFEFF/, "").trim().split(/\r?\n/);
    expect(lines).toHaveLength(4);
  });

  it("rejects an inverted custom range before querying charges", async () => {
    const result = await loadCrmOverview("admin-1", {
      now: FIXED,
      preset: "custom",
      from: "2026-10-10",
      to: "2026-10-01",
    });

    expect(result).toMatchObject({
      ok: false,
      status: 400,
      error: "La fecha inicial no puede ser posterior a la final",
    });
    expect(prismaMock.establishment.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.charge.findMany).not.toHaveBeenCalled();
  });

  it("returns a clear error when the admin has no establishment", async () => {
    prismaMock.establishment.findFirst.mockResolvedValue(null);

    const result = await loadCrmOverview("admin-1", { now: FIXED });

    expect(result).toEqual({
      ok: false,
      status: 400,
      error: "No tienes un establecimiento configurado",
    });
    expect(prismaMock.charge.findMany).not.toHaveBeenCalled();
  });
});
