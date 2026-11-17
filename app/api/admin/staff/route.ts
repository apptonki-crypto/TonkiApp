import { logAndRespondAuthInfrastructureError } from "src/lib/api/authRouteCatch";
import { requireActiveAdminSession } from "src/lib/api/requireActiveAdmin";
import { apiError, apiSuccess } from "src/lib/api/response";
import { getPublicAppOrigin } from "src/lib/auth/publicAppOrigin";
import { renderChargeQrDataUrl } from "src/lib/charges/chargeQr";
import { createStaffInvite, listStaffOverview } from "src/lib/staff/invites";

export async function GET() {
  try {
    const gate = await requireActiveAdminSession();
    if (!gate.ok) return gate.response;
    return apiSuccess(await listStaffOverview(gate.userId));
  } catch (err) {
    const infra = logAndRespondAuthInfrastructureError("[api/admin/staff GET]", err);
    if (infra) return infra;
    return apiError("Error al cargar meseros", 500);
  }
}

/** Crea una invitación de un solo uso. El enlace solo se devuelve aquí. */
export async function POST(req: Request) {
  try {
    const gate = await requireActiveAdminSession();
    if (!gate.ok) return gate.response;
    const created = await createStaffInvite({
      adminId: gate.userId,
      origin: getPublicAppOrigin(req),
    });
    if (!created.ok) return apiError(created.error, created.status);
    const qr_image = await renderChargeQrDataUrl(created.invite.url);
    return apiSuccess({ invite: { ...created.invite, qr_image } }, 201);
  } catch (err) {
    const infra = logAndRespondAuthInfrastructureError("[api/admin/staff POST]", err);
    if (infra) return infra;
    return apiError("Error al crear la invitación", 500);
  }
}
