import { logAndRespondAuthInfrastructureError } from "src/lib/api/authRouteCatch";
import { parseRequestJson } from "src/lib/api/readJsonSafely";
import { requireActiveClientSession } from "src/lib/api/requireActiveClient";
import { apiError, apiSuccess } from "src/lib/api/response";
import { redeemCatalogPrize } from "src/lib/rewards/redeem";
import { redeemPrizeSchema } from "src/lib/rewards/schemas";

export async function POST(req: Request) {
  try {
    const gate = await requireActiveClientSession();
    if (!gate.ok) return gate.response;

    const body = await parseRequestJson(req);
    if (!body) return apiError("Cuerpo inválido", 400);
    const parsed = redeemPrizeSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(parsed.error.issues[0]?.message ?? "Datos inválidos", 400);
    }

    const result = await redeemCatalogPrize({
      userId: gate.userId,
      establishmentRewardId: parsed.data.establishment_reward_id,
    });
    if (!result.ok) return apiError(result.error, result.status);
    return apiSuccess(
      { redemption: result.redemption, total_points: result.total_points },
      201
    );
  } catch (err) {
    const infra = logAndRespondAuthInfrastructureError("[api/rewards/redeem]", err);
    if (infra) return infra;
    return apiError("No se pudo canjear el premio", 500);
  }
}
