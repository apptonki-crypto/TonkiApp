import { fetchSessionJson } from "src/lib/api/fetchSessionJson";

export type AdminMetricsPost = {
  post_id: string;
  title: string;
  view_count: number;
  share_count: number;
  created_at: string;
};

export type AdminMetricsPayload = {
  totals: {
    post_count: number;
    total_views: number;
    total_shares: number;
    avg_views: number;
    avg_shares: number;
  };
  top_by_views: AdminMetricsPost[];
  top_by_shares: AdminMetricsPost[];
};

type AdminMetricsSuccessBody = AdminMetricsPayload & { success: true };

export type FetchAdminMetricsResult =
  | { ok: true; metrics: AdminMetricsPayload }
  | { ok: false; error: string; unauthorized?: true };

function isAdminMetricsSuccess(data: unknown): data is AdminMetricsSuccessBody {
  if (typeof data !== "object" || data === null) return false;
  const o = data as Record<string, unknown>;
  if (o.success !== true) return false;
  if (typeof o.totals !== "object" || o.totals === null) return false;
  if (!Array.isArray(o.top_by_views) || !Array.isArray(o.top_by_shares)) {
    return false;
  }
  return true;
}

export async function fetchAdminMetrics(opts: {
  networkErrorMessage: string;
}): Promise<FetchAdminMetricsResult> {
  const result = await fetchSessionJson<AdminMetricsPayload>(
    "/api/admin/metrics",
    {
      networkErrorMessage: opts.networkErrorMessage,
      parse: (body) => {
        if (!isAdminMetricsSuccess(body)) return null;
        const { totals, top_by_views, top_by_shares } = body;
        return { totals, top_by_views, top_by_shares };
      },
    }
  );

  if (!result.ok) return result;
  return { ok: true, metrics: result.data };
}
