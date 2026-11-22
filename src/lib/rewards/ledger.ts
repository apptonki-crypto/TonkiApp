import prisma from "src/lib/db";

import { ledgerInt, spendableTonkis } from "./balance";

const HELD_STATUSES = ["pending", "delivered"] as const;

type RawClient = {
  $queryRaw: <T>(query: TemplateStringsArray, ...values: unknown[]) => Promise<T>;
};

/**
 * Bloquea los Tonkis acreditados y los canjes que los apartan.
 * Las dos lecturas son `FOR UPDATE` para que dos canjes del mismo cliente no gasten el mismo saldo.
 */
export async function lockSpendableLedger(
  tx: RawClient,
  userId: string
): Promise<{ earned: number; held: number }> {
  const earnedRows = await tx.$queryRaw<Array<{ earned: unknown }>>`
    SELECT COALESCE(SUM(points), 0) AS earned
    FROM Reward
    WHERE user_id = ${userId}
    FOR UPDATE
  `;
  const heldRows = await tx.$queryRaw<Array<{ held: unknown }>>`
    SELECT COALESCE(SUM(points), 0) AS held
    FROM PrizeRedemption
    WHERE user_id = ${userId}
      AND status IN ('pending', 'delivered')
    FOR UPDATE
  `;
  return {
    earned: ledgerInt(earnedRows[0]?.earned),
    held: ledgerInt(heldRows[0]?.held),
  };
}

/** Saldo que ven Recompensas y Cuenta. Las tablas y el airdrop siguen sumando lo acreditado de por vida. */
export async function readSpendableTonkis(userId: string): Promise<number> {
  const [earned, held] = await Promise.all([
    prisma.reward.aggregate({
      where: { user_id: userId },
      _sum: { points: true },
    }),
    prisma.prizeRedemption.aggregate({
      where: { user_id: userId, status: { in: [...HELD_STATUSES] } },
      _sum: { points: true },
    }),
  ]);
  return spendableTonkis(earned._sum.points ?? 0, held._sum.points ?? 0);
}
