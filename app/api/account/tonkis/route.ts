import prisma from "src/lib/db";
import { logAndRespondAuthInfrastructureError } from "src/lib/api/authRouteCatch";
import { apiError, apiSuccess } from "src/lib/api/response";
import { getSessionUserId } from "src/lib/auth/session";
import type { TonkisCredit } from "src/lib/account/types";
import { CHARGE_STATUS_CREDITED } from "src/lib/charges/constants";

/**
 * Same points total as GET /api/rewards, plus recent QR credits.
 * Admins do not get a user airdrop or this ledger.
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

    const pointsAgg = await prisma.reward.aggregate({
      where: { user_id: userId },
      _sum: { points: true },
    });
    const total_points = pointsAgg._sum.points ?? 0;

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

    return apiSuccess({ total_points, recent });
  } catch (err) {
    const infra = logAndRespondAuthInfrastructureError(
      "[api/account/tonkis GET]",
      err
    );
    if (infra) return infra;
    return apiError("Error al cargar tus Tonkis", 500);
  }
}
