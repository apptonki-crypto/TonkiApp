import { NextResponse } from "next/server";

import { logAndRespondAuthInfrastructureError } from "src/lib/api/authRouteCatch";
import { requireActiveAdminSession } from "src/lib/api/requireActiveAdmin";
import { apiError } from "src/lib/api/response";
import { readCrmAnalyticsOptions } from "src/lib/crm/analytics";
import { loadCrmExportCsv } from "src/lib/crm/loadCrmOverview";

export async function GET(req: Request) {
  try {
    const gate = await requireActiveAdminSession();
    if (!gate.ok) return gate.response;

    const parsed = readCrmAnalyticsOptions(new URL(req.url).searchParams);
    if (!parsed.ok) return apiError(parsed.error, 400);

    const loaded = await loadCrmExportCsv(gate.userId, parsed.query);
    if (!loaded.ok) return apiError(loaded.error, loaded.status);

    return new NextResponse(loaded.csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${loaded.filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const infra = logAndRespondAuthInfrastructureError(
      "[api/admin/crm/export GET]",
      err
    );
    if (infra) return infra;
    return apiError("Error al exportar el CRM", 500);
  }
}
