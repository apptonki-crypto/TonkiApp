import prisma from "src/lib/db";
import { logAndRespondAuthInfrastructureError } from "src/lib/api/authRouteCatch";
import { apiError, apiSuccess } from "src/lib/api/response";
import { getSessionUserId } from "src/lib/auth/session";
import type { TonkisCredit, TonkisRedemptionMovement } from "src/lib/account/types";
import { CHARGE_STATUS_CREDITED } from "src/lib/charges/constants";
import { readSpendableTonkis } from "src/lib/rewards/ledger";

/**
 * Saldo disponible (igual que GET /api/rewards para un cliente), créditos recientes
 * y canjes que apartan o ya gastaron Tonkis. Un admin no tiene este libro.
 */
export async function GET() {
  try {
    const userId = await getSessionUserId();
    if (!userId) return apiError("No autenticado", 401);

    const user = await prisma.user.findUnique({
      where: { user_id: userId },
      select: { type: true, status: true },
    });
    if (!user || user.status !== "active") {
      return apiError("No autenticado", 401);
    }
    if (user.type !== "user") {
      return apiError("Prohibido", 403);
    }

    const total_points = await readSpendableTonkis(userId);

    const rows = await prisma.charge.findMany({
      where: {
        claimed_by_user_id: userId,
        status: CHARGE_STATUS_CREDITED,
      },
      orderBy: { updated_at: "desc" },
      take: 8,
      select: {
        charge_id: true,
        updated_at: true,
        establishment: { select: { name: true } },
        reward: { select: { points: true } },
      },
    });

    const recent: TonkisCredit[] = rows.flatMap((row) => {
      if (!row.reward) return [];
      return [
        {
          charge_id: row.charge_id,
          establishment_name: row.establishment.name,
          points: row.reward.points,
          credited_at: row.updated_at.toISOString(),
        },
      ];
    });

    const redemptionRows = await prisma.prizeRedemption.findMany({
      where: {
        user_id: userId,
        status: { in: ["pending", "delivered"] },
      },
      orderBy: { created_at: "desc" },
      take: 8,
      select: {
        redemption_id: true,
        title: true,
        points: true,
        status: true,
        created_at: true,
        establishment: { select: { name: true } },
      },
    });
    const redemptions: TonkisRedemptionMovement[] = redemptionRows.flatMap((row) => {
      if (row.status !== "pending" && row.status !== "delivered") return [];
      return [
        {
          id: row.redemption_id,
          establishment_name: row.establishment.name,
          title: row.title,
          points: row.points,
          status: row.status,
          at: row.created_at.toISOString(),
        },
      ];
    });

    return apiSuccess({ total_points, recent, redemptions });
  } catch (err) {
    const infra = logAndRespondAuthInfrastructureError(
      "[api/account/tonkis GET]",
      err
    );
    if (infra) return infra;
    return apiError("Error al cargar tus Tonkis", 500);
  }
}
