import { logAndRespondAuthInfrastructureError } from "src/lib/api/authRouteCatch";
import { requireActiveAdminSession } from "src/lib/api/requireActiveAdmin";
import { apiError, apiSuccess } from "src/lib/api/response";
import { revokeStaffInvite } from "src/lib/staff/invites";
import { staffInviteIdSchema } from "src/lib/staff/schemas";

type RouteContext = { params: Promise<{ inviteId: string }> };

/** Cancela una invitación pendiente. */
export async function DELETE(_req: Request, context: RouteContext) {
  try {
    const gate = await requireActiveAdminSession();
    if (!gate.ok) return gate.response;
    const { inviteId } = await context.params;
    const parsed = staffInviteIdSchema.safeParse(inviteId);
    if (!parsed.success) return apiError("Invitación inválida", 400);

    const result = await revokeStaffInvite({ adminId: gate.userId, inviteId: parsed.data });
    if (!result.ok) return apiError(result.error, result.status);
    return apiSuccess({ message: "Invitación cancelada" });
  } catch (err) {
    const infra = logAndRespondAuthInfrastructureError("[api/admin/staff/invites DELETE]", err);
    if (infra) return infra;
    return apiError("Error al cancelar la invitación", 500);
  }
}
