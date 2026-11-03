import { fetchSessionJson } from "src/lib/api/fetchSessionJson";
import type {
  CrmAnalyticsQuery,
  CrmOverviewPayload,
  CrmProduct,
} from "src/lib/crm/types";

export type FetchCrmOverviewResult =
  | { ok: true; overview: CrmOverviewPayload }
  | { ok: false; error: string; unauthorized?: true };

export type FetchCrmProductsResult =
  | { ok: true; products: CrmProduct[] }
  | { ok: false; error: string; unauthorized?: true };

function isOverviewSuccess(
  data: unknown
): data is { success: true; overview: CrmOverviewPayload } {
  if (typeof data !== "object" || data === null) return false;
  const o = data as Record<string, unknown>;
  return o.success === true && typeof o.overview === "object" && o.overview !== null;
}

function isProductsSuccess(
  data: unknown
): data is { success: true; products: CrmProduct[] } {
  if (typeof data !== "object" || data === null) return false;
  const o = data as Record<string, unknown>;
  return o.success === true && Array.isArray(o.products);
}

function isProductSuccess(
  data: unknown
): data is { success: true; product: CrmProduct } {
  if (typeof data !== "object" || data === null) return false;
  const o = data as Record<string, unknown>;
  return o.success === true && typeof o.product === "object" && o.product !== null;
}

export function crmAnalyticsQueryString(query: CrmAnalyticsQuery): string {
  const params = new URLSearchParams();
  params.set("range", query.preset);
  params.set("status", query.status);
  if (query.preset === "custom" && query.from && query.to) {
    params.set("from", query.from);
    params.set("to", query.to);
  }
  return params.toString();
}

export function crmExportPath(query: CrmAnalyticsQuery): string {
  return `/api/admin/crm/export?${crmAnalyticsQueryString(query)}`;
}

export async function fetchCrmOverview(opts: {
  networkErrorMessage: string;
  query: CrmAnalyticsQuery;
}): Promise<FetchCrmOverviewResult> {
  const result = await fetchSessionJson<CrmOverviewPayload>(
    `/api/admin/crm?${crmAnalyticsQueryString(opts.query)}`,
    {
      networkErrorMessage: opts.networkErrorMessage,
      parse: (body) => (isOverviewSuccess(body) ? body.overview : null),
    }
  );
  if (!result.ok) return result;
  return { ok: true, overview: result.data };
}

export async function fetchCrmProducts(opts: {
  networkErrorMessage: string;
  includeInactive?: boolean;
}): Promise<FetchCrmProductsResult> {
  const query = opts.includeInactive ? "?include_inactive=1" : "";
  const result = await fetchSessionJson<CrmProduct[]>(
    `/api/admin/crm/products${query}`,
    {
      networkErrorMessage: opts.networkErrorMessage,
      parse: (body) => (isProductsSuccess(body) ? body.products : null),
    }
  );
  if (!result.ok) return result;
  return { ok: true, products: result.data };
}

export async function createCrmProduct(
  input: {
    name: string;
    sku?: string;
    description?: string;
    unit_price: string;
  },
  opts: { networkErrorMessage: string }
): Promise<
  | { ok: true; product: CrmProduct }
  | { ok: false; error: string; unauthorized?: true }
> {
  const result = await fetchSessionJson<CrmProduct>("/api/admin/crm/products", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    networkErrorMessage: opts.networkErrorMessage,
    parse: (body) => (isProductSuccess(body) ? body.product : null),
  });
  if (!result.ok) return result;
  return { ok: true, product: result.data };
}

export async function updateCrmProduct(
  productId: string,
  input: Partial<{
    name: string;
    sku: string;
    description: string;
    unit_price: string;
    is_active: boolean;
  }>,
  opts: { networkErrorMessage: string }
): Promise<
  | { ok: true; product: CrmProduct }
  | { ok: false; error: string; unauthorized?: true }
> {
  const result = await fetchSessionJson<CrmProduct>(
    `/api/admin/crm/products/${productId}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      networkErrorMessage: opts.networkErrorMessage,
      parse: (body) => (isProductSuccess(body) ? body.product : null),
    }
  );
  if (!result.ok) return result;
  return { ok: true, product: result.data };
}
