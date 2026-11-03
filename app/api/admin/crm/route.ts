import { logAndRespondAuthInfrastructureError } from "src/lib/api/authRouteCatch";
import { requireActiveAdminSession } from "src/lib/api/requireActiveAdmin";
import { apiError, apiSuccess } from "src/lib/api/response";
import { readCrmAnalyticsOptions } from "src/lib/crm/analytics";
import { loadCrmOverview } from "src/lib/crm/loadCrmOverview";

export async function GET(req: Request) {
  try {
    const gate = await requireActiveAdminSession();
    if (!gate.ok) return gate.response;

    const parsed = readCrmAnalyticsOptions(new URL(req.url).searchParams);
    if (!parsed.ok) return apiError(parsed.error, 400);

    const loaded = await loadCrmOverview(gate.userId, parsed.query);
    if (!loaded.ok) return apiError(loaded.error, loaded.status);

    return apiSuccess({ overview: loaded.payload });
  } catch (err) {
    const infra = logAndRespondAuthInfrastructureError("[api/admin/crm GET]", err);
    if (infra) return infra;
    return apiError("Error al cargar el CRM", 500);
  }
}
