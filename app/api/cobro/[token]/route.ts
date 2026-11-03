import { logAndRespondAuthInfrastructureError } from "src/lib/api/authRouteCatch";
import { apiError, apiSuccess } from "src/lib/api/response";
import { getSessionUserId } from "src/lib/auth/session";
import { creditChargeForUser } from "src/lib/charges/creditCharge";
import { loadChargePreview } from "src/lib/charges/preview";

type RouteContext = {
  params: Promise<{ token: string }>;
};

async function requireUserId() {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false as const, response: apiError("No autenticado", 401) };
  return { ok: true as const, userId };
}

export async function GET(_req: Request, context: RouteContext) {
  try {
    const gate = await requireUserId();
    if (!gate.ok) return gate.response;
    const { token } = await context.params;
    const loaded = await loadChargePreview(token, gate.userId);
    if (!loaded.ok) return apiError(loaded.error, loaded.status);
    return apiSuccess({ charge: loaded.preview });
  } catch (err) {
    const infra = logAndRespondAuthInfrastructureError("[api/cobro GET]", err);
    if (infra) return infra;
    return apiError("Error al cargar el código", 500);
  }
}

export async function POST(_req: Request, context: RouteContext) {
  try {
    const gate = await requireUserId();
    if (!gate.ok) return gate.response;
    const { token } = await context.params;
    const credited = await creditChargeForUser(token, gate.userId);
    if (!credited.ok) return apiError(credited.error, credited.status);
    return apiSuccess({
      message: `Se acreditaron ${credited.points.toLocaleString("es-MX")} Tonkis.`,
      points: credited.points,
      establishment_name: credited.establishment_name,
      total_points: credited.total_points,
    });
  } catch (err) {
    const infra = logAndRespondAuthInfrastructureError("[api/cobro POST]", err);
    if (infra) return infra;
    return apiError("Error al acreditar Tonkis", 500);
  }
}
