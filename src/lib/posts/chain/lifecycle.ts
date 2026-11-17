import { Prisma } from "src/generated/prisma/client";

import prisma from "src/lib/db";
import { shouldDeployOnCreate } from "src/lib/posts/chain/authority";
import { chainBudgetAllowsNewDynamics } from "src/lib/posts/chain/budget";
import {
  ChainConfigError,
  readChainConfig,
  readChainMode,
} from "src/lib/posts/chain/config";
import { configHash, type DynamicChainSource } from "src/lib/posts/chain/hashes";
import { enqueueChainJob } from "src/lib/posts/chain/jobs";
import { PostDynamicRequestError } from "src/lib/posts/dynamicRequests";

type Client = Prisma.TransactionClient | typeof prisma;

export const CHAIN_NOT_CONFIGURED_MESSAGE =
  "La red Stellar no está configurada. Intenta más tarde.";
export const CHAIN_BUDGET_MESSAGE =
  "Por ahora no podemos crear dinámicas nuevas. Intenta más tarde.";

export type ChainCreatePlan =
  | { chain: false }
  | { chain: true; chain_status: "pending"; config_hash: string };

/**
 * Decides whether a new (or re-created) dynamic gets a contract.
 * - mode off or kind not enabled: legacy.
 * - shadow with incomplete settings: legacy, never block authors for a comparison feature.
 * - on with incomplete settings or no XLM budget: refuse, so a misconfiguration is loud
 *   instead of silently skipping the contract.
 */
export async function planChainOnCreate(
  source: DynamicChainSource,
  now: Date = new Date()
): Promise<ChainCreatePlan> {
  if (!shouldDeployOnCreate(source.kind)) return { chain: false };

  let secret: string;
  try {
    secret = readChainConfig().hashSecret;
  } catch (error) {
    if (error instanceof ChainConfigError && readChainMode() === "shadow") {
      console.warn("[dynamics-chain] shadow mode disabled for this dynamic:", error.message);
      return { chain: false };
    }
    throw new PostDynamicRequestError(503, CHAIN_NOT_CONFIGURED_MESSAGE);
  }

  const budget = await chainBudgetAllowsNewDynamics(now);
  if (!budget.allowed) throw new PostDynamicRequestError(503, CHAIN_BUDGET_MESSAGE);

  return {
    chain: true,
    chain_status: "pending",
    config_hash: configHash(source, secret).toString("hex"),
  };
}

/** Row fields to write together with the dynamic when it needs a contract. */
export function chainCreateFields(plan: ChainCreatePlan) {
  return plan.chain
    ? { chain_status: plan.chain_status, config_hash: plan.config_hash }
    : {};
}

export async function enqueueDeploy(
  client: Client,
  dynamicId: string,
  plan: ChainCreatePlan
): Promise<void> {
  if (!plan.chain) return;
  await enqueueChainJob(client, {
    dynamicId,
    type: "deploy",
    dedupeKey: plan.config_hash.slice(0, 64),
    payload: { config_hash: plan.config_hash },
  });
}

/** Closes a contract that is no longer reachable from the database (edited, closed or removed). */
export async function enqueueForceClose(
  client: Client,
  dynamicId: string,
  contractId: string | null | undefined
): Promise<void> {
  if (!contractId) return;
  await enqueueChainJob(client, {
    dynamicId,
    type: "close",
    dedupeKey: `force:${contractId}`,
    contractId,
    payload: { force: true },
  });
}
