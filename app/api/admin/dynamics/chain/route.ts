import { apiError, apiSuccess } from "src/lib/api/response";
import { requireActiveAdminSession } from "src/lib/api/requireActiveAdmin";
import { getSignerBudget } from "src/lib/posts/chain/budget";
import { readChainMode } from "src/lib/posts/chain/config";
import { getChainCostReport } from "src/lib/posts/chain/costs";

export const dynamic = "force-dynamic";

/** Cost, queue health and signer balance for the on-chain dynamics (admin only). */
export async function GET(req: Request) {
  try {
    const gate = await requireActiveAdminSession();
    if (!gate.ok) return gate.response;

    const days = Number(new URL(req.url).searchParams.get("days") ?? 30);
    const report = await getChainCostReport({
      days: Number.isFinite(days) ? days : 30,
    });

    let balance:
      | { balance_xlm: number; min_balance_xlm: number; ok: boolean }
      | { error: string }
      | null = null;
    if (readChainMode() !== "off") {
      try {
        const budget = await getSignerBudget();
        balance = {
          balance_xlm: budget.balanceXlm,
          min_balance_xlm: budget.minBalanceXlm,
          ok: budget.ok,
        };
      } catch {
        balance = { error: "No se pudo leer el saldo del firmante." };
      }
    }

    return apiSuccess({ report, balance });
  } catch {
    return apiError("Error al leer el estado de las dinámicas on-chain", 500);
  }
}
