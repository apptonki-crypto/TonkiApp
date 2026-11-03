import { Prisma } from "src/generated/prisma/client";
import { decimalToMoneyString } from "src/lib/crm/decimal";
import {
  eachDateKey,
  formatCrmDayTick,
  isRealIsoDate,
  mexicoCityStamp,
  weekdayIndexForDateKey,
  CRM_WEEKDAY_SHORT,
} from "src/lib/crm/mexicoCity";
import { crmSaleStatusLabel } from "src/lib/crm/saleStatus";
import {
  CRM_UNASSIGNED_PRODUCT_ID,
  CRM_UNASSIGNED_PRODUCT_NAME,
  type CrmAnalyticsQuery,
  type CrmDayHourSeries,
  type CrmDayPoint,
  type CrmHourPoint,
  type CrmPeriodPreset,
  type CrmProductPerformance,
  type CrmSale,
  type CrmSeries,
  type CrmStatusFilter,
  type CrmWeekdayPoint,
} from "src/lib/crm/types";

const PRESETS: readonly CrmPeriodPreset[] = [
  "today",
  "7d",
  "30d",
  "month",
  "custom",
];
const STATUSES: readonly CrmStatusFilter[] = ["credited", "pending", "all"];

const CSV_HEADERS = [
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
] as const;

export type CrmAnalyticsSummary = {
  sales_count: number;
  revenue: string;
  average_ticket: string;
};

function isPreset(value: string): value is CrmPeriodPreset {
  return (PRESETS as readonly string[]).includes(value);
}

function isStatus(value: string): value is CrmStatusFilter {
  return (STATUSES as readonly string[]).includes(value);
}

function cleanParam(value: string | null): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export function readCrmAnalyticsOptions(
  searchParams: URLSearchParams
): { ok: true; query: CrmAnalyticsQuery } | { ok: false; error: string } {
  const rangeRaw = cleanParam(searchParams.get("range"));
  const statusRaw = cleanParam(searchParams.get("status"));
  const preset = rangeRaw ?? "30d";
  const status = statusRaw ?? "credited";

  if (!isPreset(preset)) return { ok: false, error: "Periodo no válido" };
  if (!isStatus(status)) return { ok: false, error: "Estado no válido" };

  if (preset !== "custom") {
    return { ok: true, query: { preset, status, from: null, to: null } };
  }

  const from = cleanParam(searchParams.get("from"));
  const to = cleanParam(searchParams.get("to"));
  if (!from || !to) {
    return { ok: false, error: "Indica la fecha inicial y final" };
  }
  if (!isRealIsoDate(from) || !isRealIsoDate(to)) {
    return { ok: false, error: "Fecha no válida" };
  }

  return { ok: true, query: { preset, status, from, to } };
}

function money(value: string): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

function formatHourLabel(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

function productKey(line: CrmSale["line_items"][number]): string {
  if (line.product_id) return line.product_id;
  return `name:${line.product_name}`;
}

export function buildCrmAnalytics(input: {
  sales: CrmSale[];
  fromDate: string;
  toDate: string;
}): { summary: CrmAnalyticsSummary; series: CrmSeries } {
  const dayTotals = new Map<
    string,
    { sales_count: number; revenue: Prisma.Decimal }
  >();
  const hoursByDay = new Map<
    string,
    { sales_count: number; revenue: Prisma.Decimal }[]
  >();
  for (const date of eachDateKey(input.fromDate, input.toDate)) {
    dayTotals.set(date, { sales_count: 0, revenue: new Prisma.Decimal(0) });
    hoursByDay.set(
      date,
      Array.from({ length: 24 }, () => ({
        sales_count: 0,
        revenue: new Prisma.Decimal(0),
      }))
    );
  }

  const weekdayTotals = CRM_WEEKDAY_SHORT.map(() => ({
    sales_count: 0,
    revenue: new Prisma.Decimal(0),
  }));
  const hourTotals = Array.from({ length: 24 }, () => ({
    sales_count: 0,
    revenue: new Prisma.Decimal(0),
  }));

  const products = new Map<
    string,
    { product_name: string; units_sold: number; revenue: Prisma.Decimal }
  >();

  let salesCount = 0;
  let revenue = new Prisma.Decimal(0);

  for (const sale of input.sales) {
    const created = new Date(sale.created_at);
    if (Number.isNaN(created.getTime())) continue;
    const stamp = mexicoCityStamp(created);
    const day = dayTotals.get(stamp.dateKey);
    if (!day) continue;

    const amount = money(sale.amount);
    salesCount += 1;
    revenue = revenue.add(amount);
    day.sales_count += 1;
    day.revenue = day.revenue.add(amount);

    const weekday = weekdayTotals[stamp.weekdayIndex];
    const hour = hourTotals[stamp.hour];
    if (weekday) {
      weekday.sales_count += 1;
      weekday.revenue = weekday.revenue.add(amount);
    }
    if (hour) {
      hour.sales_count += 1;
      hour.revenue = hour.revenue.add(amount);
    }
    const dayHour = hoursByDay.get(stamp.dateKey)?.[stamp.hour];
    if (dayHour) {
      dayHour.sales_count += 1;
      dayHour.revenue = dayHour.revenue.add(amount);
    }

    if (sale.line_items.length === 0) {
      const existing = products.get(CRM_UNASSIGNED_PRODUCT_ID);
      if (existing) {
        existing.units_sold += 1;
        existing.revenue = existing.revenue.add(amount);
      } else {
        products.set(CRM_UNASSIGNED_PRODUCT_ID, {
          product_name: CRM_UNASSIGNED_PRODUCT_NAME,
          units_sold: 1,
          revenue: amount,
        });
      }
      continue;
    }

    for (const line of sale.line_items) {
      const key = productKey(line);
      const lineRevenue = money(line.line_total);
      const existing = products.get(key);
      if (existing) {
        existing.units_sold += line.quantity;
        existing.revenue = existing.revenue.add(lineRevenue);
      } else {
        products.set(key, {
          product_name: line.product_name || CRM_UNASSIGNED_PRODUCT_NAME,
          units_sold: line.quantity,
          revenue: lineRevenue,
        });
      }
    }
  }

  const by_day: CrmDayPoint[] = [...dayTotals.entries()].map(([date, stats]) => ({
    date,
    label: formatCrmDayTick(date),
    sales_count: stats.sales_count,
    revenue: decimalToMoneyString(stats.revenue),
  }));

  const by_weekday: CrmWeekdayPoint[] = weekdayTotals.map((stats, weekday) => ({
    weekday,
    label: CRM_WEEKDAY_SHORT[weekday] ?? "lun",
    sales_count: stats.sales_count,
    revenue: decimalToMoneyString(stats.revenue),
  }));

  const by_hour: CrmHourPoint[] = hourTotals.map((stats, hour) => ({
    hour,
    label: String(hour),
    sales_count: stats.sales_count,
    revenue: decimalToMoneyString(stats.revenue),
  }));

  const hours_by_day: CrmDayHourSeries[] = [...hoursByDay.entries()].map(
    ([date, slots]) => ({
      date,
      label: formatCrmDayTick(date),
      weekday: weekdayIndexForDateKey(date),
      hours: slots.map((stats, hour) => ({
        hour,
        label: formatHourLabel(hour),
        sales_count: stats.sales_count,
        revenue: decimalToMoneyString(stats.revenue),
      })),
    })
  );

  const by_product: CrmProductPerformance[] = [...products.entries()]
    .map(([product_id, stats]) => ({
      product_id,
      product_name: stats.product_name,
      units_sold: stats.units_sold,
      revenue: stats.revenue,
    }))
    .sort((a, b) => {
      const byRevenue = b.revenue.comparedTo(a.revenue);
      if (byRevenue !== 0) return byRevenue;
      return a.product_name.localeCompare(b.product_name, "es");
    })
    .map((row) => ({
      product_id: row.product_id,
      product_name: row.product_name,
      units_sold: row.units_sold,
      revenue: decimalToMoneyString(row.revenue),
    }));

  const average =
    salesCount > 0 ? revenue.div(salesCount) : new Prisma.Decimal(0);

  return {
    summary: {
      sales_count: salesCount,
      revenue: decimalToMoneyString(revenue),
      average_ticket: decimalToMoneyString(average),
    },
    series: { by_day, by_weekday, by_hour, hours_by_day, by_product },
  };
}

function csvCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function csvLine(cells: string[]): string {
  return cells.map(csvCell).join(",");
}

export function buildCrmCsv(sales: CrmSale[]): string {
  const ordered = [...sales].sort((a, b) => {
    const byTime = a.created_at.localeCompare(b.created_at);
    if (byTime !== 0) return byTime;
    return a.charge_id.localeCompare(b.charge_id);
  });

  const rows = [csvLine([...CSV_HEADERS])];

  for (const sale of ordered) {
    const created = new Date(sale.created_at);
    const stamp = Number.isNaN(created.getTime()) ? null : mexicoCityStamp(created);
    const shared = [
      stamp?.dateKey ?? "",
      stamp?.time ?? "",
      stamp?.weekdayFull ?? "",
      sale.charge_id,
      crmSaleStatusLabel(sale.status),
      sale.claimed_by_name ?? "",
      sale.amount,
    ];

    if (sale.line_items.length === 0) {
      rows.push(csvLine([...shared, "", "", "", sale.amount]));
      continue;
    }

    for (const line of sale.line_items) {
      rows.push(
        csvLine([
          ...shared,
          line.product_name,
          String(line.quantity),
          line.unit_price,
          line.line_total,
        ])
      );
    }
  }

  return `\uFEFF${rows.join("\r\n")}\r\n`;
}
