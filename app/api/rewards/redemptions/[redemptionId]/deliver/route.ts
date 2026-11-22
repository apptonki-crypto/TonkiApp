import { logAndRespondAuthInfrastructureError } from "src/lib/api/authRouteCatch";
import { requireActiveAdminSession } from "src/lib/api/requireActiveAdmin";
import { apiError, apiSuccess } from "src/lib/api/response";
import { deliverPrizeRedemption } from "src/lib/rewards/redeem";

type RouteContext = {
  params: Promise<{ redemptionId: string }>;
};

export async function POST(_req: Request, context: RouteContext) {
  try {
    const gate = await requireActiveAdminSession();
    if (!gate.ok) return gate.response;

    const { redemptionId } = await context.params;
    if (!redemptionId?.trim() || redemptionId.length > 36) {
      return apiError("Canje no válido", 400);
    }

    const result = await deliverPrizeRedemption({
      adminId: gate.userId,
      redemptionId,
    });
    if (!result.ok) return apiError(result.error, result.status);
    return apiSuccess({ redemption: result.redemption });
  } catch (err) {
    const infra = logAndRespondAuthInfrastructureError(
      "[api/rewards/redemptions/deliver]",
      err
    );
    if (infra) return infra;
    return apiError("No se pudo marcar el canje como entregado", 500);
  }
}
