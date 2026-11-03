import { logAndRespondAuthInfrastructureError } from "src/lib/api/authRouteCatch";
import { apiError, apiSuccess } from "src/lib/api/response";
import { loadPublicEstablishment } from "src/lib/establishment/loadPublicProfile";

type RouteContext = { params: Promise<{ establishmentId: string }> };

export async function GET(_req: Request, context: RouteContext) {
  try {
    const { establishmentId } = await context.params;
    if (!establishmentId || establishmentId.length > 36) {
      return apiError("Lugar no encontrado", 404);
    }
    const establishment = await loadPublicEstablishment(establishmentId);
    if (!establishment) return apiError("Lugar no encontrado", 404);
    return apiSuccess({ establishment });
  } catch (err) {
    const infra = logAndRespondAuthInfrastructureError(
      "[api/establishments GET]",
      err
    );
    if (infra) return infra;
    return apiError("Error al cargar el lugar", 500);
  }
}
