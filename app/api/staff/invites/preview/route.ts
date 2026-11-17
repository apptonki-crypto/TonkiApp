import { logAndRespondAuthInfrastructureError } from "src/lib/api/authRouteCatch";
import { parseRequestJson } from "src/lib/api/readJsonSafely";
import { apiError, apiSuccess } from "src/lib/api/response";
import { getSessionUserId } from "src/lib/auth/session";
import { previewStaffInvite } from "src/lib/staff/invites";
import { staffInviteRedeemSchema } from "src/lib/staff/schemas";

/** Nombre del negocio que invita, para confirmar antes de unirse. */
export async function POST(req: Request) {
  try {
    if (!(await getSessionUserId())) return apiError("No autenticado", 401);

    const parsed = staffInviteRedeemSchema.safeParse(await parseRequestJson(req));
    if (!parsed.success) return apiError("Invitación inválida", 400);

    const result = await previewStaffInvite(parsed.data.token);
    if (!result.ok) return apiError(result.error, result.status);
    return apiSuccess({ establishment_name: result.establishment_name });
  } catch (err) {
    const infra = logAndRespondAuthInfrastructureError("[api/staff/invites/preview]", err);
    if (infra) return infra;
    return apiError("Error al revisar la invitación", 500);
  }
}
