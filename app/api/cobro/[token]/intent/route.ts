import { logAndRespondAuthInfrastructureError } from "src/lib/api/authRouteCatch";
import { apiError, apiSuccess } from "src/lib/api/response";
import { getSessionUserId } from "src/lib/auth/session";
import { lockPaymentIntent } from "src/lib/charges/settlement/intent";

type RouteContext = {
  params: Promise<{ token: string }>;
};

/** Locks the amount, destination wallet and memo the customer must send. */
export async function POST(_req: Request, context: RouteContext) {
  try {
    const userId = await getSessionUserId();
    if (!userId) return apiError("No autenticado", 401);
    const { token } = await context.params;
    const locked = await lockPaymentIntent(token, userId);
    if (!locked.ok) return apiError(locked.error, locked.status);
    return apiSuccess({ intent: locked.intent });
  } catch (err) {
    const infra = logAndRespondAuthInfrastructureError(
      "[api/cobro/intent POST]",
      err
    );
    if (infra) return infra;
    return apiError("No se pudo preparar el pago", 500);
  }
}
