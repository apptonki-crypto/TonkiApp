import { Address, nativeToScVal, scValToNative, xdr } from "@stellar/stellar-sdk";

import { DYNAMIC_KINDS, type DynamicKind } from "src/lib/posts/dynamics/constants";
import type { ContractConfigInput } from "src/lib/posts/chain/hashes";
import {
  CHAIN_OUTCOMES,
  CHAIN_STATUSES,
  type ChainContractStatus,
  type ChainOutcome,
  type ChainState,
} from "src/lib/posts/chain/types";

/** Index in the contract's `Kind` enum. Must stay in the order of DYNAMIC_KINDS. */
export function kindToCode(kind: DynamicKind): number {
  return DYNAMIC_KINDS.indexOf(kind);
}

export function codeToKind(code: number): DynamicKind {
  const kind = DYNAMIC_KINDS[code];
  if (!kind) throw new Error(`Tipo de dinámica desconocido en cadena: ${code}`);
  return kind;
}

/**
 * `Config` struct. Soroban structs are maps keyed by field name; `nativeToScVal`
 * emits the keys sorted, which the host requires.
 */
export function encodeConfig(config: ContractConfigInput): xdr.ScVal {
  return nativeToScVal(
    {
      kind: kindToCode(config.kind),
      goal_count: config.goalCount,
      goal_amount: config.goalAmount,
      min_ticket: config.minTicket,
      starts_at: config.startsAt,
      ends_at: config.endsAt,
      config_hash: config.configHash,
    },
    {
      type: {
        kind: ["symbol", "u32"],
        goal_count: ["symbol", "u32"],
        goal_amount: ["symbol", "i128"],
        min_ticket: ["symbol", "i128"],
        starts_at: ["symbol", "u64"],
        ends_at: ["symbol", "u64"],
        config_hash: ["symbol", null],
      },
    }
  );
}

export function encodeAddress(address: string): xdr.ScVal {
  return new Address(address).toScVal();
}

export function encodeBytes32(bytes: Buffer): xdr.ScVal {
  if (bytes.length !== 32) throw new Error("Hash inválido: se esperaban 32 bytes");
  return xdr.ScVal.scvBytes(bytes);
}

export function encodeI128(value: bigint): xdr.ScVal {
  return nativeToScVal(value, { type: "i128" });
}

export function encodeBytesVec(items: readonly Buffer[]): xdr.ScVal {
  return xdr.ScVal.scvVec(items.map(encodeBytes32));
}

export function encodeChargeEntries(
  entries: readonly { hash: Buffer; amount: bigint }[]
): xdr.ScVal {
  return xdr.ScVal.scvVec(
    entries.map((entry) =>
      nativeToScVal(
        { charge_hash: entry.hash, amount: entry.amount },
        {
          type: {
            charge_hash: ["symbol", null],
            amount: ["symbol", "i128"],
          },
        }
      )
    )
  );
}

export function decodeOutcome(value: xdr.ScVal): ChainOutcome {
  const code = Number(scValToNative(value));
  const outcome = CHAIN_OUTCOMES[code];
  if (!outcome) throw new Error(`Resultado desconocido en cadena: ${code}`);
  return outcome;
}

export function decodeStatus(value: xdr.ScVal): ChainContractStatus {
  const code = Number(scValToNative(value));
  const status = CHAIN_STATUSES[code];
  if (!status) throw new Error(`Estado desconocido en cadena: ${code}`);
  return status;
}

export function decodeU32(value: xdr.ScVal): number {
  return Number(scValToNative(value));
}

type RawConfig = {
  kind: number;
  goal_count: number;
  goal_amount: bigint;
  min_ticket: bigint;
  starts_at: bigint;
  ends_at: bigint;
  config_hash: Buffer | Uint8Array;
};

type RawState = {
  admin: string;
  config: RawConfig;
  status: number;
  progress_count: number;
  progress_amount: bigint;
  closed_at: bigint;
};

export function decodeState(value: xdr.ScVal): ChainState {
  const raw = scValToNative(value) as RawState;
  const status = CHAIN_STATUSES[Number(raw.status)];
  if (!status) throw new Error(`Estado desconocido en cadena: ${raw.status}`);
  return {
    admin: raw.admin,
    kind: codeToKind(Number(raw.config.kind)),
    goalCount: Number(raw.config.goal_count),
    goalAmount: BigInt(raw.config.goal_amount),
    minTicket: BigInt(raw.config.min_ticket),
    startsAt: BigInt(raw.config.starts_at),
    endsAt: BigInt(raw.config.ends_at),
    configHash: Buffer.from(raw.config.config_hash).toString("hex"),
    status,
    progressCount: Number(raw.progress_count),
    progressAmount: BigInt(raw.progress_amount),
    closedAt: BigInt(raw.closed_at),
  };
}
