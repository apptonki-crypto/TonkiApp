import { logAndRespondAuthInfrastructureError } from "src/lib/api/authRouteCatch";
import { requireActiveClientSession } from "src/lib/api/requireActiveClient";
import { apiError, apiSuccess } from "src/lib/api/response";
import { checkInWithPresentationToken } from "src/lib/establishment/presentation";

type RouteContext = { params: Promise<{ token: string }> };

/** El cliente escaneó el QR de presentación: registra la visita del día. */
export async function POST(_req: Request, context: RouteContext) {
  try {
    const gate = await requireActiveClientSession();
    if (!gate.ok) return gate.response;

    const { token } = await context.params;
    const result = await checkInWithPresentationToken(gate.userId, token);
    if (!result.ok) return apiError(result.error, result.status);

    return apiSuccess({ check_in: result.checkIn }, result.checkIn.already_today ? 200 : 201);
  } catch (err) {
    const infra = logAndRespondAuthInfrastructureError("[api/visita POST]", err);
    if (infra) return infra;
    return apiError("No se pudo registrar la visita", 500);
  }
}
