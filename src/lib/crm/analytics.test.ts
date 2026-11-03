import { describe, expect, it } from "vitest";

import { buildCrmAnalytics, buildCrmCsv, readCrmAnalyticsOptions } from "./analytics";
import { peakRevenueHour, peakSaleHours } from "./hourPeaks";
import { mexicoCityStamp, resolveCrmRange } from "./mexicoCity";
import type { CrmSale } from "./types";

function sale(overrides: Partial<CrmSale> = {}): CrmSale {
  return {
    charge_id: "charge-1",
    amount: "100.00",
    status: "credited",
    cashback_percent: 5,
    created_at: "2026-10-26T05:30:00.000Z",
    updated_at: "2026-10-26T05:30:00.000Z",
    claimed_by_name: null,
    line_items: [],
    ...overrides,
  };
}

function parseCsv(csv: string): string[][] {
  const text = csv.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\n$/, "");
  return text.split("\n").map(parseCsvLine);
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      cells.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  cells.push(current);
  return cells;
}

describe("America/Mexico_City buckets", () => {
  it("places 23:30 and the next local midnight on different hours and weekdays", () => {
    expect(mexicoCityStamp(new Date("2026-10-26T05:30:00.000Z"))).toMatchObject({
      dateKey: "2026-10-25",
      hour: 23,
      time: "23:30",
      weekdayIndex: 6,
      weekdayShort: "dom",
      weekdayFull: "domingo",
    });
    expect(mexicoCityStamp(new Date("2026-10-26T06:00:00.000Z"))).toMatchObject({
      dateKey: "2026-10-26",
      hour: 0,
      time: "00:00",
      weekdayIndex: 0,
      weekdayShort: "lun",
      weekdayFull: "lunes",
    });
  });

  it("keeps the last minute of a Mexico City day in hour 23 and drops the next midnight", () => {
    const range = resolveCrmRange({
      preset: "today",
      now: new Date("2026-10-25T18:00:00.000Z"),
    });
    expect(range.ok).toBe(true);
    if (!range.ok) return;
    expect(range.range).toMatchObject({
      fromDate: "2026-10-25",
      toDate: "2026-10-25",
    });
    expect(range.range.from.toISOString()).toBe("2026-10-25T06:00:00.000Z");
    expect(range.range.to.toISOString()).toBe("2026-10-26T06:00:00.000Z");

    const analytics = buildCrmAnalytics({
      sales: [
        sale({
          charge_id: "late",
          amount: "100.00",
          created_at: "2026-10-26T05:59:59.000Z",
        }),
        sale({
          charge_id: "next-midnight",
          amount: "40.00",
          created_at: "2026-10-26T06:00:00.000Z",
        }),
      ],
      fromDate: range.range.fromDate,
      toDate: range.range.toDate,
    });

    expect(analytics.summary).toMatchObject({
      sales_count: 1,
      revenue: "100.00",
      average_ticket: "100.00",
    });
    expect(analytics.series.by_day).toEqual([
      {
        date: "2026-10-25",
        label: "25 oct",
        sales_count: 1,
        revenue: "100.00",
      },
    ]);
    expect(analytics.series.by_hour[23]).toMatchObject({
      hour: 23,
      label: "23",
      sales_count: 1,
      revenue: "100.00",
    });
    expect(analytics.series.by_hour[0]?.sales_count).toBe(0);
    expect(analytics.series.by_hour).toHaveLength(24);
    expect(analytics.series.by_weekday.map((day) => day.label)).toEqual([
      "lun",
      "mar",
      "mié",
      "jue",
      "vie",
      "sáb",
      "dom",
    ]);
    expect(analytics.series.by_weekday[6]).toMatchObject({
      sales_count: 1,
      revenue: "100.00",
    });
    expect(analytics.series.by_weekday[0]?.sales_count).toBe(0);
    expect(analytics.series.hours_by_day).toHaveLength(1);
    expect(analytics.series.hours_by_day[0]?.weekday).toBe(6);
    expect(analytics.series.hours_by_day[0]?.hours[23]).toMatchObject({
      hour: 23,
      label: "23:00",
      sales_count: 1,
      revenue: "100.00",
    });
    expect(peakSaleHours(analytics.series.hours_by_day[0]?.hours ?? []).map((hour) => hour.hour)).toEqual([
      23,
    ]);
  });

  it("keeps each day's hourly peak separate from the other days", () => {
    const analytics = buildCrmAnalytics({
      sales: [
        sale({
          charge_id: "sat-noon",
          amount: "80.00",
          created_at: "2026-10-24T18:00:00.000Z",
        }),
        sale({
          charge_id: "sat-noon-2",
          amount: "20.00",
          created_at: "2026-10-24T18:30:00.000Z",
        }),
        sale({
          charge_id: "sat-evening",
          amount: "200.00",
          created_at: "2026-10-25T01:00:00.000Z",
        }),
        sale({
          charge_id: "sun-late",
          amount: "40.00",
          created_at: "2026-10-26T04:00:00.000Z",
        }),
      ],
      fromDate: "2026-10-24",
      toDate: "2026-10-25",
    });

    expect(analytics.series.hours_by_day.map((day) => day.date)).toEqual([
      "2026-10-24",
      "2026-10-25",
    ]);
    expect(analytics.series.hours_by_day[0]).toMatchObject({ weekday: 5 });
    expect(analytics.series.hours_by_day[0]?.hours[12]).toMatchObject({
      label: "12:00",
      sales_count: 2,
      revenue: "100.00",
    });
    expect(analytics.series.hours_by_day[0]?.hours[19]).toMatchObject({
      label: "19:00",
      sales_count: 1,
      revenue: "200.00",
    });
    expect(analytics.series.hours_by_day[1]?.hours[22]).toMatchObject({
      label: "22:00",
      sales_count: 1,
      revenue: "40.00",
    });
    expect(analytics.series.hours_by_day[1]?.hours[12]?.sales_count).toBe(0);
    expect(analytics.series.by_hour[12]?.sales_count).toBe(2);
    expect(peakSaleHours(analytics.series.hours_by_day[0]?.hours ?? []).map((hour) => hour.hour)).toEqual([
      12,
    ]);
    expect(peakRevenueHour(analytics.series.hours_by_day[0]?.hours ?? [])?.hour).toBe(19);
    expect(peakSaleHours(analytics.series.hours_by_day[1]?.hours ?? []).map((hour) => hour.hour)).toEqual([
      22,
    ]);
  });

  it("keeps every hour tied for the most sales", () => {
    const hours = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      label: `${String(hour).padStart(2, "0")}:00`,
      sales_count: hour === 10 || hour === 18 ? 3 : 0,
      revenue: hour === 18 ? "90.00" : hour === 10 ? "30.00" : "0.00",
    }));

    expect(peakSaleHours(hours).map((hour) => hour.hour)).toEqual([10, 18]);
    expect(peakRevenueHour(hours)?.hour).toBe(18);
  });

  it("fills days without sales with zero and still counts this month in Mexico City", () => {
    const month = resolveCrmRange({
      preset: "month",
      now: new Date("2026-10-01T05:00:00.000Z"),
    });
    expect(month.ok).toBe(true);
    if (!month.ok) return;
    expect(month.range.fromDate).toBe("2026-09-01");
    expect(month.range.toDate).toBe("2026-09-30");
    expect(month.range.from.toISOString()).toBe("2026-09-01T06:00:00.000Z");
    expect(month.range.to.toISOString()).toBe("2026-10-01T06:00:00.000Z");

    const week = resolveCrmRange({
      preset: "7d",
      now: new Date("2026-10-25T18:00:00.000Z"),
    });
    expect(week.ok).toBe(true);
    if (!week.ok) return;
    expect(week.range.fromDate).toBe("2026-10-19");
    expect(week.range.toDate).toBe("2026-10-25");

    const analytics = buildCrmAnalytics({
      sales: [
        sale({
          created_at: "2026-10-24T18:00:00.000Z",
          amount: "80.00",
        }),
      ],
      fromDate: "2026-10-23",
      toDate: "2026-10-25",
    });

    expect(analytics.series.by_day).toEqual([
      { date: "2026-10-23", label: "23 oct", sales_count: 0, revenue: "0.00" },
      { date: "2026-10-24", label: "24 oct", sales_count: 1, revenue: "80.00" },
      { date: "2026-10-25", label: "25 oct", sales_count: 0, revenue: "0.00" },
    ]);
  });

  it("groups amount-only sales as Sin producto and keeps product line totals", () => {
    const analytics = buildCrmAnalytics({
      sales: [
        sale({
          charge_id: "with-lines",
          amount: "110.00",
          line_items: [
            {
              line_item_id: "line-1",
              product_id: "prod-cafe",
              product_name: "Café",
              quantity: 2,
              unit_price: "45.00",
              line_total: "90.00",
            },
            {
              line_item_id: "line-2",
              product_id: null,
              product_name: "Pan",
              quantity: 1,
              unit_price: "20.00",
              line_total: "20.00",
            },
          ],
        }),
        sale({
          charge_id: "amount-only",
          amount: "40.00",
          created_at: "2026-10-25T18:00:00.000Z",
          line_items: [],
        }),
      ],
      fromDate: "2026-10-25",
      toDate: "2026-10-25",
    });

    expect(analytics.summary).toEqual({
      sales_count: 2,
      revenue: "150.00",
      average_ticket: "75.00",
    });
    expect(analytics.series.by_product).toEqual([
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
        product_id: "name:Pan",
        product_name: "Pan",
        units_sold: 1,
        revenue: "20.00",
      },
    ]);
  });

  it("rounds the average ticket to cents", () => {
    const analytics = buildCrmAnalytics({
      sales: [
        sale({ charge_id: "a", amount: "100.00" }),
        sale({ charge_id: "b", amount: "50.00" }),
        sale({ charge_id: "c", amount: "25.00" }),
      ],
      fromDate: "2026-10-25",
      toDate: "2026-10-25",
    });
    expect(analytics.summary.average_ticket).toBe("58.33");
  });
});

describe("CRM CSV rows", () => {
  it("writes one row per line, an amount-only row, and a UTF-8 BOM", () => {
    const csv = buildCrmCsv([
      sale({
        charge_id: "charge-2",
        amount: "1250.50",
        status: "pending",
        created_at: "2026-10-26T06:15:00.000Z",
        claimed_by_name: "Niño, Pérez",
        line_items: [],
      }),
      sale({
        charge_id: "charge-1",
        amount: "110.00",
        status: "credited",
        created_at: "2026-10-26T05:30:00.000Z",
        claimed_by_name: "Ana",
        line_items: [
          {
            line_item_id: "line-1",
            product_id: "prod-cafe",
            product_name: 'Café "oro"',
            quantity: 2,
            unit_price: "45.00",
            line_total: "90.00",
          },
          {
            line_item_id: "line-2",
            product_id: "prod-pan",
            product_name: "Pan, dulce",
            quantity: 1,
            unit_price: "20.00",
            line_total: "20.00",
          },
        ],
      }),
    ]);

    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.endsWith("\r\n")).toBe(true);

    const rows = parseCsv(csv);
    expect(rows[0]).toEqual([
      "fecha",
      "hora",
      "día",
      "id de venta",
      "estado",
      "cliente",
      "monto de la venta",
      "producto",
      "cantidad",
      "precio unitario",
      "total de la línea",
    ]);
    expect(rows).toHaveLength(4);
    expect(rows[1]).toEqual([
      "2026-10-25",
      "23:30",
      "domingo",
      "charge-1",
      "Confirmada",
      "Ana",
      "110.00",
      'Café "oro"',
      "2",
      "45.00",
      "90.00",
    ]);
    expect(rows[2]).toEqual([
      "2026-10-25",
      "23:30",
      "domingo",
      "charge-1",
      "Confirmada",
      "Ana",
      "110.00",
      "Pan, dulce",
      "1",
      "20.00",
      "20.00",
    ]);
    expect(rows[3]).toEqual([
      "2026-10-26",
      "00:15",
      "lunes",
      "charge-2",
      "Pendiente",
      "Niño, Pérez",
      "1250.50",
      "",
      "",
      "",
      "1250.50",
    ]);
  });
});

describe("readCrmAnalyticsOptions", () => {
  it("defaults to the last 30 days of confirmed sales", () => {
    const parsed = readCrmAnalyticsOptions(new URLSearchParams());
    expect(parsed).toEqual({
      ok: true,
      query: { preset: "30d", status: "credited", from: null, to: null },
    });
  });

  it("rejects an unknown status and a custom range without dates", () => {
    expect(
      readCrmAnalyticsOptions(new URLSearchParams("status=void"))
    ).toEqual({ ok: false, error: "Estado no válido" });
    expect(
      readCrmAnalyticsOptions(new URLSearchParams("range=custom"))
    ).toEqual({ ok: false, error: "Indica la fecha inicial y final" });
    expect(
      readCrmAnalyticsOptions(
        new URLSearchParams("range=custom&from=2026-02-31&to=2026-03-01")
      )
    ).toEqual({ ok: false, error: "Fecha no válida" });
    expect(
      resolveCrmRange({
        preset: "custom",
        from: "2026-10-10",
        to: "2026-10-01",
      })
    ).toMatchObject({ ok: false });
    expect(
      resolveCrmRange({
        preset: "custom",
        from: "2024-01-01",
        to: "2025-01-01",
      })
    ).toEqual({
      ok: false,
      error: "El periodo no puede ser mayor a 366 días",
    });
  });
});
