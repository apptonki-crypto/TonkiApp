export const CRM_TIME_ZONE = "America/Mexico_City" as const;

export const CRM_UNASSIGNED_PRODUCT_ID = "sin-producto";
export const CRM_UNASSIGNED_PRODUCT_NAME = "Sin producto";

export type CrmPeriodPreset = "today" | "7d" | "30d" | "month" | "custom";

export type CrmStatusFilter = "credited" | "pending" | "all";

export type CrmAnalyticsQuery = {
  preset: CrmPeriodPreset;
  status: CrmStatusFilter;
  from: string | null;
  to: string | null;
};

export type CrmAnalyticsFilter = {
  preset: CrmPeriodPreset;
  status: CrmStatusFilter;
  from: string;
  to: string;
  time_zone: typeof CRM_TIME_ZONE;
};

export type CrmProduct = {
  product_id: string;
  name: string;
  sku: string | null;
  description: string | null;
  unit_price: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type CrmSaleLineItem = {
  line_item_id: string;
  product_id: string | null;
  product_name: string;
  quantity: number;
  unit_price: string;
  line_total: string;
};

export type CrmSale = {
  charge_id: string;
  amount: string;
  status: string;
  cashback_percent: number;
  created_at: string;
  updated_at: string;
  claimed_by_name: string | null;
  /** Mesero que generó el QR. Null = lo generó el negocio. */
  created_by_staff_name: string | null;
  line_items: CrmSaleLineItem[];
};

export type CrmProductPerformance = {
  product_id: string;
  product_name: string;
  units_sold: number;
  revenue: string;
};

export type CrmDayPoint = {
  date: string;
  label: string;
  sales_count: number;
  revenue: string;
};

export type CrmWeekdayPoint = {
  weekday: number;
  label: string;
  sales_count: number;
  revenue: string;
};

export type CrmHourPoint = {
  hour: number;
  label: string;
  sales_count: number;
  revenue: string;
};

export type CrmDayHourSeries = {
  date: string;
  label: string;
  weekday: number;
  hours: CrmHourPoint[];
};

export type CrmSeries = {
  by_day: CrmDayPoint[];
  by_weekday: CrmWeekdayPoint[];
  by_hour: CrmHourPoint[];
  hours_by_day: CrmDayHourSeries[];
  by_product: CrmProductPerformance[];
};

export type CrmOverviewPayload = {
  establishment_name: string;
  cashback_percent: number;
  filter: CrmAnalyticsFilter;
  summary: {
    sales_count: number;
    revenue: string;
    average_ticket: string;
    active_products_count: number;
  };
  series: CrmSeries;
  recent_sales: CrmSale[];
  sales_truncated: boolean;
};
