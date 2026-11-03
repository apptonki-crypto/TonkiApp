import { Prisma } from "src/generated/prisma/client";
import prisma from "src/lib/db";
import {
  CHARGE_STATUS_CREDITED,
  CHARGE_STATUS_PENDING,
} from "src/lib/charges/constants";
import { buildCrmAnalytics, buildCrmCsv } from "src/lib/crm/analytics";
import {
  decimalToMoneyString,
  multiplyLineTotal,
} from "src/lib/crm/decimal";
import { resolveCrmRange } from "src/lib/crm/mexicoCity";
import {
  CRM_TIME_ZONE,
  type CrmAnalyticsQuery,
  type CrmOverviewPayload,
  type CrmSale,
  type CrmSaleLineItem,
} from "src/lib/crm/types";

export const CRM_SALES_LIST_LIMIT = 200;

export type LoadCrmOverviewOptions = Partial<CrmAnalyticsQuery> & {
  now?: Date;
  salesLimit?: number;
};

type LoadFailure = { ok: false; status: number; error: string };

type FilteredCrmData = {
  ok: true;
  establishmentName: string;
  cashbackPercent: number;
  activeProductsCount: number;
  sales: CrmSale[];
  preset: CrmAnalyticsQuery["preset"];
  status: CrmAnalyticsQuery["status"];
  fromDate: string;
  toDate: string;
};

function mapLineItem(row: {
  line_item_id: string;
  product_id: string | null;
  product_name: string;
  quantity: number;
  unit_price: Prisma.Decimal;
}): CrmSaleLineItem {
  const lineTotal = multiplyLineTotal(row.unit_price, row.quantity);
  return {
    line_item_id: row.line_item_id,
    product_id: row.product_id,
    product_name: row.product_name,
    quantity: row.quantity,
    unit_price: decimalToMoneyString(row.unit_price),
    line_total: decimalToMoneyString(lineTotal),
  };
}

function mapSale(row: {
  charge_id: string;
  amount: Prisma.Decimal;
  status: string;
  cashback_percent: number;
  created_at: Date;
  updated_at: Date;
  claimed_by: { name: string } | null;
  line_items: {
    line_item_id: string;
    product_id: string | null;
    product_name: string;
    quantity: number;
    unit_price: Prisma.Decimal;
  }[];
}): CrmSale {
  return {
    charge_id: row.charge_id,
    amount: decimalToMoneyString(row.amount),
    status: row.status,
    cashback_percent: row.cashback_percent,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
    claimed_by_name: row.claimed_by?.name ?? null,
    line_items: row.line_items.map(mapLineItem),
  };
}

async function loadFilteredSales(
  adminId: string,
  options: LoadCrmOverviewOptions
): Promise<FilteredCrmData | LoadFailure> {
  const preset = options.preset ?? "30d";
  const status = options.status ?? "credited";
  const range = resolveCrmRange({
    preset,
    from: options.from,
    to: options.to,
    now: options.now,
  });
  if (!range.ok) return { ok: false, status: 400, error: range.error };

  const establishment = await prisma.establishment.findFirst({
    where: { admin_id: adminId },
    orderBy: { created_at: "asc" },
    select: {
      establishment_id: true,
      name: true,
      cashback_percent: true,
    },
  });
  if (!establishment) {
    return {
      ok: false,
      status: 400,
      error: "No tienes un establecimiento configurado",
    };
  }

  const statusWhere =
    status === "all"
      ? { in: [CHARGE_STATUS_CREDITED, CHARGE_STATUS_PENDING] }
      : status;

  // Series and CSV need every charge in the cut. Hour and day buckets are
  // built in code so MySQL does not have to know America/Mexico_City.
  const [charges, activeProductsCount] = await Promise.all([
    prisma.charge.findMany({
      where: {
        establishment_id: establishment.establishment_id,
        status: statusWhere,
        created_at: { gte: range.range.from, lt: range.range.to },
      },
      orderBy: [{ created_at: "desc" }, { charge_id: "asc" }],
      select: {
        charge_id: true,
        amount: true,
        status: true,
        cashback_percent: true,
        created_at: true,
        updated_at: true,
        claimed_by: { select: { name: true } },
        line_items: {
          orderBy: { created_at: "asc" },
          select: {
            line_item_id: true,
            product_id: true,
            product_name: true,
            quantity: true,
            unit_price: true,
          },
        },
      },
    }),
    prisma.product.count({
      where: { establishment_id: establishment.establishment_id, is_active: true },
    }),
  ]);

  return {
    ok: true,
    establishmentName: establishment.name,
    cashbackPercent: establishment.cashback_percent,
    activeProductsCount,
    sales: charges.map(mapSale),
    preset,
    status,
    fromDate: range.range.fromDate,
    toDate: range.range.toDate,
  };
}

export async function loadCrmOverview(
  adminId: string,
  options: LoadCrmOverviewOptions = {}
): Promise<{ ok: true; payload: CrmOverviewPayload } | LoadFailure> {
  const loaded = await loadFilteredSales(adminId, options);
  if (!loaded.ok) return loaded;

  const salesLimit = options.salesLimit ?? CRM_SALES_LIST_LIMIT;
  const analytics = buildCrmAnalytics({
    sales: loaded.sales,
    fromDate: loaded.fromDate,
    toDate: loaded.toDate,
  });

  return {
    ok: true,
    payload: {
      establishment_name: loaded.establishmentName,
      cashback_percent: loaded.cashbackPercent,
      filter: {
        preset: loaded.preset,
        status: loaded.status,
        from: loaded.fromDate,
        to: loaded.toDate,
        time_zone: CRM_TIME_ZONE,
      },
      summary: {
        ...analytics.summary,
        active_products_count: loaded.activeProductsCount,
      },
      series: analytics.series,
      recent_sales: loaded.sales.slice(0, salesLimit),
      sales_truncated: loaded.sales.length > salesLimit,
    },
  };
}

export async function loadCrmExportCsv(
  adminId: string,
  options: LoadCrmOverviewOptions = {}
): Promise<{ ok: true; csv: string; filename: string } | LoadFailure> {
  const loaded = await loadFilteredSales(adminId, options);
  if (!loaded.ok) return loaded;

  return {
    ok: true,
    csv: buildCrmCsv(loaded.sales),
    filename: `ventas-${loaded.fromDate}-a-${loaded.toDate}.csv`,
  };
}
