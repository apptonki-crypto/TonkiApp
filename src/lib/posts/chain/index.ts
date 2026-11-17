import { readChainConfig } from "src/lib/posts/chain/config";
import { SorobanDynamicChain } from "src/lib/posts/chain/sorobanChain";
import type { DynamicChain } from "src/lib/posts/chain/types";

export * from "src/lib/posts/chain/config";
export * from "src/lib/posts/chain/types";
export {
  chargeHash,
  configHash,
  fromCentavos,
  participantHash,
  toCentavos,
  toContractConfig,
  type DynamicChainSource,
} from "src/lib/posts/chain/hashes";

let override: DynamicChain | null = null;
let instance: DynamicChain | null = null;

/** Lazily built so `off` mode never needs chain settings or opens an RPC client. */
export function getDynamicChain(): DynamicChain {
  if (override) return override;
  if (!instance) instance = new SorobanDynamicChain(readChainConfig());
  return instance;
}

/** Tests and scripts only. Pass `null` to restore the real client. */
export function setDynamicChainForTests(chain: DynamicChain | null): void {
  override = chain;
  if (chain === null) instance = null;
}
