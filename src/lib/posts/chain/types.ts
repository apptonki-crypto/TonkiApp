import type { DynamicKind } from "src/lib/posts/dynamics/constants";
import type { DynamicChainSource } from "src/lib/posts/chain/hashes";

/** Outcome codes returned by `participate` and `apply_consumption`. */
export const CHAIN_OUTCOMES = [
  "recorded",
  "already_recorded",
  "upcoming",
  "exhausted",
  "expired",
  "wrong_kind",
  "below_min_ticket",
] as const;

export type ChainOutcome = (typeof CHAIN_OUTCOMES)[number];

export const CHAIN_STATUSES = ["active", "exhausted", "expired"] as const;

export type ChainContractStatus = (typeof CHAIN_STATUSES)[number];

export type ChainState = {
  admin: string;
  kind: DynamicKind;
  goalCount: number;
  /** Centavos. */
  goalAmount: bigint;
  minTicket: bigint;
  startsAt: bigint;
  endsAt: bigint;
  configHash: string;
  status: ChainContractStatus;
  progressCount: number;
  /** Centavos. */
  progressAmount: bigint;
  closedAt: bigint;
};

export type ChainTx<T> = {
  value: T;
  txHash: string;
  /** Fee charged by the network, in stroops, when the result could be decoded. */
  feeStroops: bigint | null;
  ledger: number | null;
};

export type ImportBatchInput = {
  participantUserIds: readonly string[];
  charges: readonly { chargeId: string; amountCentavos: bigint }[];
};

/** Everything the app needs from the ledger. The Soroban implementation lives in sorobanChain.ts. */
export interface DynamicChain {
  /** Deterministic address the deploy will produce for this exact config. */
  contractIdFor(source: DynamicChainSource): string;
  /** Deploys and initializes in one transaction. Safe to retry: reuses an existing instance. */
  deploy(source: DynamicChainSource): Promise<ChainTx<{ contractId: string }>>;
  participate(contractId: string, userId: string): Promise<ChainTx<ChainOutcome>>;
  applyConsumption(
    contractId: string,
    chargeId: string,
    amountCentavos: bigint
  ): Promise<ChainTx<ChainOutcome>>;
  /** Forces `exhausted`. */
  close(contractId: string): Promise<ChainTx<ChainContractStatus>>;
  /** Applies the goal/time transition on-chain. */
  evaluate(contractId: string): Promise<ChainTx<ChainContractStatus>>;
  importBatch(contractId: string, input: ImportBatchInput): Promise<ChainTx<number>>;
  bump(contractId: string): Promise<ChainTx<null>>;
  readState(contractId: string): Promise<ChainState>;
  signerBalanceXlm(): Promise<number>;
  latestLedger(): Promise<number>;
}

export class ChainTransactionError extends Error {
  constructor(
    message: string,
    /** True when retrying later can succeed (RPC/network/sequence), false for contract rejections. */
    public readonly retryable: boolean,
    public readonly txHash?: string
  ) {
    super(message);
    this.name = "ChainTransactionError";
  }
}
