import { logAndRespondAuthInfrastructureError } from "src/lib/api/authRouteCatch";
import { parseRequestJson } from "src/lib/api/readJsonSafely";
import { apiError, apiSuccess } from "src/lib/api/response";
import { getSessionUserId } from "src/lib/auth/session";
import { recordRampOrder } from "src/lib/charges/settlement/rampOrder";

type RouteContext = {
  params: Promise<{ token: string }>;
};

/**
 * Stores the id and state of the ramp order the payer opened for this charge.
 * The order itself lives in the customer's Pollar session; this route never
 * calls Pollar and never stores payment instructions.
 */
export async function POST(req: Request, context: RouteContext) {
  try {
    const userId = await getSessionUserId();
    if (!userId) return apiError("No autenticado", 401);
    const { token } = await context.params;
    const json = await parseRequestJson(req);
    const body =
      json && typeof json === "object"
        ? (json as { order_id?: unknown; state?: unknown })
        : {};
    const recorded = await recordRampOrder(token, userId, {
      orderId: body.order_id,
      state: body.state,
    });
    if (!recorded.ok) return apiError(recorded.error, recorded.status);
    return apiSuccess({ message: "Orden guardada." });
  } catch (err) {
    const infra = logAndRespondAuthInfrastructureError(
      "[api/cobro/ramp POST]",
      err
    );
    if (infra) return infra;
    return apiError("No se pudo guardar la orden", 500);
  }
}
