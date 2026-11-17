import { createHash, createHmac } from "crypto";

import { Prisma } from "src/generated/prisma/client";

import type { DynamicKind } from "src/lib/posts/dynamics/constants";
import { readConsumptionConfig } from "src/lib/posts/dynamics/rules";

const ZERO = BigInt(0);

/** Domain-separated so a user id can never collide with a charge id. */
export function participantHash(userId: string): Buffer {
  return createHash("sha256").update(`tonki:participant:${userId}`).digest();
}

export function chargeHash(chargeId: string): Buffer {
  return createHash("sha256").update(`tonki:charge:${chargeId}`).digest();
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record)
        .sort()
        .map((key) => [key, canonicalize(record[key])])
    );
  }
  return value;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export type DynamicChainSource = {
  dynamic_id: string;
  kind: DynamicKind;
  config: unknown;
  goal_count: number | null;
  starts_at: Date | null;
  ends_at: Date | null;
  establishment_id: string | null;
  token: string | null;
};

/**
 * Keyed hash of everything that defines the dynamic, including the promo code and
 * QR token. Keyed (HMAC) because short promo codes would be trivially brute-forced
 * from a plain hash on a public ledger.
 */
export function configHash(source: DynamicChainSource, secret: string): Buffer {
  const body = canonicalJson({
    v: 1,
    dynamic_id: source.dynamic_id,
    kind: source.kind,
    config: source.config,
    goal_count: source.goal_count,
    starts_at: source.starts_at ? source.starts_at.toISOString() : null,
    ends_at: source.ends_at ? source.ends_at.toISOString() : null,
    establishment_id: source.establishment_id,
    token: source.token,
  });
  return createHmac("sha256", secret).update(body).digest();
}

/** Pesos (Decimal or string) to centavos as bigint. Rounds half up like the DB column. */
export function toCentavos(amount: Prisma.Decimal | number | string): bigint {
  const cents = new Prisma.Decimal(amount).mul(100).toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP);
  return BigInt(cents.toFixed(0));
}

export function fromCentavos(cents: bigint): Prisma.Decimal {
  return new Prisma.Decimal(cents.toString()).div(100);
}

function toSeconds(value: Date | null): bigint {
  return value ? BigInt(Math.floor(value.getTime() / 1000)) : ZERO;
}

/** Constructor `Config` of the contract, before XDR encoding. */
export type ContractConfigInput = {
  kind: DynamicKind;
  goalCount: number;
  goalAmount: bigint;
  minTicket: bigint;
  startsAt: bigint;
  endsAt: bigint;
  configHash: Buffer;
};

export function toContractConfig(
  source: DynamicChainSource,
  secret: string
): ContractConfigInput {
  const base = {
    kind: source.kind,
    goalCount: source.goal_count ?? 0,
    goalAmount: ZERO,
    minTicket: ZERO,
    startsAt: toSeconds(source.starts_at),
    endsAt: toSeconds(source.ends_at),
    configHash: configHash(source, secret),
  };

  if (source.kind === "consumption") {
    const config = readConsumptionConfig(source.config);
    if (!config) throw new Error("Configuración de consumo inválida");
    const amountMode = config.goal_mode === "amount";
    return {
      ...base,
      goalCount: amountMode ? 0 : (source.goal_count ?? 0),
      goalAmount: amountMode && config.goal_amount ? toCentavos(config.goal_amount) : ZERO,
      minTicket: config.min_ticket ? toCentavos(config.min_ticket) : ZERO,
    };
  }
  return base;
}
