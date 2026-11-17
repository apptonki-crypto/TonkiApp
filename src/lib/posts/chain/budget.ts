import { readChainConfig, readChainMode } from "src/lib/posts/chain/config";
import { getDynamicChain } from "src/lib/posts/chain";

export type SignerBudget = {
  balanceXlm: number;
  minBalanceXlm: number;
  ok: boolean;
  checkedAt: Date;
};

const CACHE_MS = 60_000;
let cached: SignerBudget | null = null;

/**
 * XLM balance of the custodial signer against the configured floor.
 * Cached briefly so creating posts does not hit the RPC every time.
 */
export async function getSignerBudget(
  now: Date = new Date(),
  options: { force?: boolean } = {}
): Promise<SignerBudget> {
  if (
    !options.force &&
    cached &&
    now.getTime() - cached.checkedAt.getTime() < CACHE_MS
  ) {
    return cached;
  }
  const { minBalanceXlm } = readChainConfig();
  const balanceXlm = await getDynamicChain().signerBalanceXlm();
  cached = {
    balanceXlm,
    minBalanceXlm,
    ok: balanceXlm >= minBalanceXlm,
    checkedAt: now,
  };
  return cached;
}

/**
 * Only `on` mode refuses new dynamics when the signer is short on XLM: a dynamic that
 * cannot deploy is useless there. An RPC failure is not a reason to block authors.
 */
export async function chainBudgetAllowsNewDynamics(
  now: Date = new Date()
): Promise<{ allowed: boolean; budget?: SignerBudget }> {
  if (readChainMode() !== "on") return { allowed: true };
  try {
    const budget = await getSignerBudget(now);
    return { allowed: budget.ok, budget };
  } catch {
    return { allowed: true };
  }
}
