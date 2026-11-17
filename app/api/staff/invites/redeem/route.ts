import { logAndRespondAuthInfrastructureError } from "src/lib/api/authRouteCatch";
import { parseRequestJson } from "src/lib/api/readJsonSafely";
import { apiError, apiSuccess } from "src/lib/api/response";
import {
  attachSessionCookie,
  createSessionToken,
  getSessionUserId,
} from "src/lib/auth/session";
import { STAFF_HOME_PATH } from "src/lib/staff/constants";
import { redeemStaffInvite } from "src/lib/staff/invites";
import { staffInviteRedeemSchema } from "src/lib/staff/schemas";

/** Un cliente acepta la invitación: queda como mesero y su sesión cambia de rol. */
export async function POST(req: Request) {
  try {
    const userId = await getSessionUserId();
    if (!userId) return apiError("No autenticado", 401);

    const parsed = staffInviteRedeemSchema.safeParse(await parseRequestJson(req));
    if (!parsed.success) return apiError("Invitación inválida", 400);

    const result = await redeemStaffInvite({ userId, token: parsed.data.token });
    if (!result.ok) return apiError(result.error, result.status);

    const res = apiSuccess({
      message: `Ya eres mesero de ${result.establishment_name}.`,
      redirectTo: STAFF_HOME_PATH,
    });
    attachSessionCookie(res, await createSessionToken({ userId, role: "staff" }));
    return res;
  } catch (err) {
    const infra = logAndRespondAuthInfrastructureError("[api/staff/invites/redeem]", err);
    if (infra) return infra;
    return apiError("Error al aceptar la invitación", 500);
  }
}
