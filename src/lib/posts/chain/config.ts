import { readPollarNetwork } from "src/lib/auth/pollarPublicConfig";
import {
  DYNAMIC_KINDS,
  isDynamicKind,
  type DynamicKind,
} from "src/lib/posts/dynamics/constants";

/**
 * off     the database is the only source of truth (legacy behavior).
 * shadow  the database stays authoritative; contracts are deployed and every
 *         write is mirrored on-chain so both can be compared.
 * on      the contract is authoritative for dynamics whose kind is enabled and
 *         whose contract is active; the database is the read mirror.
 */
export type ChainMode = "off" | "shadow" | "on";

export const CHAIN_MODES: readonly ChainMode[] = ["off", "shadow", "on"];

type Env = Record<string, string | undefined>;

export function readChainMode(env: Env = process.env): ChainMode {
  const raw = env.DYNAMICS_CHAIN_MODE?.trim().toLowerCase();
  return CHAIN_MODES.find((mode) => mode === raw) ?? "off";
}

/**
 * Kinds that use contracts. `DYNAMICS_CHAIN_KINDS` is a comma list (rollout by type);
 * empty or `all` means every kind.
 */
export function readChainKinds(env: Env = process.env): ReadonlySet<DynamicKind> {
  const raw = env.DYNAMICS_CHAIN_KINDS?.trim();
  if (!raw || raw.toLowerCase() === "all") return new Set(DYNAMIC_KINDS);
  const kinds = raw
    .split(",")
    .map((part) => part.trim())
    .filter(isDynamicKind);
  return new Set(kinds);
}

export function isChainKindEnabled(
  kind: string,
  env: Env = process.env
): boolean {
  if (readChainMode(env) === "off") return false;
  return isDynamicKind(kind) && readChainKinds(env).has(kind);
}

export type ChainConfig = {
  network: "testnet" | "mainnet";
  rpcUrl: string;
  networkPassphrase: string;
  /** Hex sha256 of the uploaded tonki-dynamic WASM. */
  wasmHash: string;
  /** Server-side signer. Never exposed to the browser. */
  deployerSecret: string;
  /** Keyed hash so promo codes and QR tokens cannot be brute-forced from the public config hash. */
  hashSecret: string;
  explorerBaseUrl: string;
  /** Minimum XLM balance of the signer before the balance alert fires. */
  minBalanceXlm: number;
};

export class ChainConfigError extends Error {
  constructor(public readonly missing: string[]) {
    super(`Falta configuración de cadena: ${missing.join(", ")}`);
    this.name = "ChainConfigError";
  }
}

const TESTNET_RPC_URL = "https://soroban-testnet.stellar.org";
const TESTNET_PASSPHRASE = "Test SDF Network ; September 2015";
const MAINNET_PASSPHRASE = "Public Global Stellar Network ; September 2015";

const EXPLORERS = {
  testnet: "https://stellar.expert/explorer/testnet",
  mainnet: "https://stellar.expert/explorer/public",
} as const;

export function readChainConfig(env: Env = process.env): ChainConfig {
  const network = readChainConfigNetwork(env);
  const rpcUrl = env.STELLAR_RPC_URL?.trim() || TESTNET_RPC_URL;
  const networkPassphrase =
    env.STELLAR_NETWORK_PASSPHRASE?.trim() || TESTNET_PASSPHRASE;

  const wasmHash = env.DYNAMIC_WASM_HASH?.trim().toLowerCase() ?? "";
  const deployerSecret = env.STELLAR_DEPLOYER_SECRET_KEY?.trim() ?? "";
  const hashSecret = env.DYNAMICS_HASH_SECRET?.trim() ?? "";

  const missing: string[] = [];
  if (!/^[0-9a-f]{64}$/.test(wasmHash)) missing.push("DYNAMIC_WASM_HASH");
  if (!/^S[A-Z2-7]{55}$/.test(deployerSecret)) {
    missing.push("STELLAR_DEPLOYER_SECRET_KEY");
  }
  if (hashSecret.length < 32) missing.push("DYNAMICS_HASH_SECRET");
  if (network === "mainnet" && networkPassphrase !== MAINNET_PASSPHRASE) {
    missing.push("STELLAR_NETWORK_PASSPHRASE (mainnet)");
  }
  if (missing.length > 0) throw new ChainConfigError(missing);

  const minBalance = Number(env.DYNAMICS_MIN_BALANCE_XLM);
  return {
    network,
    rpcUrl,
    networkPassphrase,
    wasmHash,
    deployerSecret,
    hashSecret,
    explorerBaseUrl: env.STELLAR_EXPLORER_URL?.trim() || EXPLORERS[network],
    minBalanceXlm: Number.isFinite(minBalance) && minBalance > 0 ? minBalance : 50,
  };
}

export function contractExplorerUrl(
  contractId: string,
  env: Env = process.env
): string {
  const network = readChainConfigNetwork(env);
  const base = env.STELLAR_EXPLORER_URL?.trim() || EXPLORERS[network];
  return `${base}/contract/${contractId}`;
}

function readChainConfigNetwork(env: Env): "testnet" | "mainnet" {
  const raw = env.STELLAR_NETWORK?.trim().toLowerCase();
  if (raw === "mainnet") return "mainnet";
  if (raw) return "testnet";
  return readPollarNetwork();
}
