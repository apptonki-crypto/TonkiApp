import { logAndRespondAuthInfrastructureError } from "src/lib/api/authRouteCatch";
import { apiError, apiSuccess } from "src/lib/api/response";
import { loadPublicUserProfile } from "src/lib/users/publicProfile";

type RouteContext = { params: Promise<{ userId: string }> };

export async function GET(_req: Request, context: RouteContext) {
  try {
    const { userId } = await context.params;
    if (!userId || userId.length > 36) {
      return apiError("Usuario no encontrado", 404);
    }
    const profile = await loadPublicUserProfile(userId);
    if (!profile) return apiError("Usuario no encontrado", 404);
    return apiSuccess({ profile });
  } catch (err) {
    const infra = logAndRespondAuthInfrastructureError("[api/users GET]", err);
    if (infra) return infra;
    return apiError("Error al cargar el perfil", 500);
  }
}
