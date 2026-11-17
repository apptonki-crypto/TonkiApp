import {
  isChainKindEnabled,
  readChainMode,
} from "src/lib/posts/chain/config";

export const CHAIN_DYNAMIC_STATUSES = [
  "legacy",
  "pending",
  "active",
  "failed",
] as const;

export type DynamicChainStatus = (typeof CHAIN_DYNAMIC_STATUSES)[number];

export type ChainAware = {
  kind: string;
  chain_status?: string | null;
  contract_id?: string | null;
};

type Env = Record<string, string | undefined>;

/** Dynamics created from now on get a contract when their kind is enabled. */
export function shouldDeployOnCreate(kind: string, env: Env = process.env): boolean {
  return isChainKindEnabled(kind, env);
}

/** The contract decides progress and closing. Only in `on` mode, with a live contract. */
export function isChainAuthoritative(
  dynamic: ChainAware,
  env: Env = process.env
): boolean {
  return (
    readChainMode(env) === "on" &&
    isChainKindEnabled(dynamic.kind, env) &&
    dynamic.chain_status === "active" &&
    Boolean(dynamic.contract_id)
  );
}

/** Shadow mode copies every write to the contract, even while it is still deploying. */
export function isShadowMirrored(dynamic: ChainAware, env: Env = process.env): boolean {
  return (
    readChainMode(env) === "shadow" &&
    isChainKindEnabled(dynamic.kind, env) &&
    (dynamic.chain_status === "pending" || dynamic.chain_status === "active")
  );
}

/**
 * `on` mode: contracts are mandatory for enabled kinds, so a dynamic that should have
 * one but is still deploying (or failed to) must not fall back to the database.
 */
export function isChainRequiredButUnavailable(
  dynamic: ChainAware,
  env: Env = process.env
): boolean {
  if (readChainMode(env) !== "on" || !isChainKindEnabled(dynamic.kind, env)) {
    return false;
  }
  return dynamic.chain_status === "pending" || dynamic.chain_status === "failed";
}

