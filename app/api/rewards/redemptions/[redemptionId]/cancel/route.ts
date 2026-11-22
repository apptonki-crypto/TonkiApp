import prisma from "src/lib/db";
import { logAndRespondAuthInfrastructureError } from "src/lib/api/authRouteCatch";
import { apiError, apiSuccess } from "src/lib/api/response";
import { getSessionUserId } from "src/lib/auth/session";
import { cancelPrizeRedemption } from "src/lib/rewards/redeem";

type RouteContext = {
  params: Promise<{ redemptionId: string }>;
};

export async function POST(_req: Request, context: RouteContext) {
  try {
    const userId = await getSessionUserId();
    if (!userId) return apiError("No autenticado", 401);

    const user = await prisma.user.findUnique({
      where: { user_id: userId },
      select: { type: true, status: true },
    });
    if (!user || user.status !== "active") {
      return apiError("Cuenta suspendida", 403);
    }
    if (user.type !== "user" && user.type !== "admin") {
      return apiError("Prohibido", 403);
    }

    const { redemptionId } = await context.params;
    if (!redemptionId?.trim() || redemptionId.length > 36) {
      return apiError("Canje no válido", 400);
    }

    const result = await cancelPrizeRedemption({
      actorUserId: userId,
      actorType: user.type,
      redemptionId,
    });
    if (!result.ok) return apiError(result.error, result.status);
    return apiSuccess({ redemption: result.redemption });
  } catch (err) {
    const infra = logAndRespondAuthInfrastructureError(
      "[api/rewards/redemptions/cancel]",
      err
    );
    if (infra) return infra;
    return apiError("No se pudo cancelar el canje", 500);
  }
}
