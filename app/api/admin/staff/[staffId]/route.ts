import { logAndRespondAuthInfrastructureError } from "src/lib/api/authRouteCatch";
import { requireActiveAdminSession } from "src/lib/api/requireActiveAdmin";
import { apiError, apiSuccess } from "src/lib/api/response";
import { revokeStaffMember } from "src/lib/staff/invites";
import { staffIdSchema } from "src/lib/staff/schemas";

type RouteContext = { params: Promise<{ staffId: string }> };

/** Da de baja a un mesero. */
export async function DELETE(_req: Request, context: RouteContext) {
  try {
    const gate = await requireActiveAdminSession();
    if (!gate.ok) return gate.response;
    const { staffId } = await context.params;
    const parsed = staffIdSchema.safeParse(staffId);
    if (!parsed.success) return apiError("Mesero inválido", 400);

    const result = await revokeStaffMember({ adminId: gate.userId, staffId: parsed.data });
    if (!result.ok) return apiError(result.error, result.status);
    return apiSuccess({ message: "Mesero dado de baja" });
  } catch (err) {
    const infra = logAndRespondAuthInfrastructureError("[api/admin/staff DELETE]", err);
    if (infra) return infra;
    return apiError("Error al dar de baja al mesero", 500);
  }
}
