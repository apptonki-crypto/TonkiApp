import { z } from "zod";
import { Prisma } from "src/generated/prisma/client";

import {
  isDynamicKind,
  isDynamicStatus,
  type DynamicKind,
  type DynamicStatus,
} from "src/lib/posts/dynamics/constants";

export type DynamicRecord = {
  dynamic_id: string;
  post_id: string;
  establishment_id: string | null;
  kind: DynamicKind;
  status: DynamicStatus;
  config: unknown;
  progress_count: number;
  progress_amount: Prisma.Decimal;
  goal_count: number | null;
  starts_at: Date | null;
  ends_at: Date | null;
  closed_at: Date | null;
  token: string | null;
  /** Absent in legacy fixtures; treated as `legacy`. */
  chain_status?: string;
  contract_id?: string | null;
  deploy_tx_hash?: string | null;
};

export const dynamicRecordSelect = {
  dynamic_id: true,
  post_id: true,
  establishment_id: true,
  kind: true,
  status: true,
  config: true,
  progress_count: true,
  progress_amount: true,
  goal_count: true,
  starts_at: true,
  ends_at: true,
  closed_at: true,
  token: true,
  chain_status: true,
  contract_id: true,
  deploy_tx_hash: true,
} as const;

type DynamicRow = {
  dynamic_id: string;
  post_id: string;
  establishment_id: string | null;
  kind: string;
  status: string;
  config: unknown;
  progress_count: number;
  progress_amount: Prisma.Decimal | number | string;
  goal_count: number | null;
  starts_at: Date | null;
  ends_at: Date | null;
  closed_at: Date | null;
  token: string | null;
  chain_status?: string;
  contract_id?: string | null;
  deploy_tx_hash?: string | null;
};

export function toDynamicRecord(row: DynamicRow): DynamicRecord | null {
  if (!isDynamicKind(row.kind) || !isDynamicStatus(row.status)) return null;
  return {
    dynamic_id: row.dynamic_id,
    post_id: row.post_id,
    establishment_id: row.establishment_id,
    kind: row.kind,
    status: row.status,
    config: row.config,
    progress_count: row.progress_count,
    progress_amount: new Prisma.Decimal(row.progress_amount),
    goal_count: row.goal_count,
    starts_at: row.starts_at,
    ends_at: row.ends_at,
    closed_at: row.closed_at,
    token: row.token,
    chain_status: row.chain_status ?? "legacy",
    contract_id: row.contract_id ?? null,
    deploy_tx_hash: row.deploy_tx_hash ?? null,
  };
}

const consumptionConfigSchema = z.object({
  text: z.string().nullable().optional(),
  goal_mode: z.enum(["count", "amount"]),
  goal_amount: z.string().nullable().optional(),
  min_ticket: z.string().nullable().optional(),
  product_ids: z.array(z.string()).optional(),
});

export type ConsumptionConfig = {
  text: string | null;
  goal_mode: "count" | "amount";
  goal_amount: string | null;
  min_ticket: string | null;
  product_ids: string[];
};

export function readConsumptionConfig(config: unknown): ConsumptionConfig | null {
  const parsed = consumptionConfigSchema.safeParse(config);
  if (!parsed.success) return null;
  return {
    text: parsed.data.text ?? null,
    goal_mode: parsed.data.goal_mode,
    goal_amount: parsed.data.goal_amount ?? null,
    min_ticket: parsed.data.min_ticket ?? null,
    product_ids: parsed.data.product_ids ?? [],
  };
}

const promoConfigSchema = z.object({
  code: z.string().min(1),
  benefit: z.string().optional(),
});

export function readPromoCode(config: unknown): string | null {
  const parsed = promoConfigSchema.safeParse(config);
  if (!parsed.success) return null;
  return parsed.data.code.trim().toUpperCase();
}

const textConfigSchema = z.object({
  text: z.string().nullable().optional(),
  benefit: z.string().optional(),
});

export type PublicConfigParts = {
  text: string;
  goal_mode: "count" | "amount" | null;
  goal_amount: string | null;
  min_ticket: string | null;
  product_ids: string[];
};

export function readPublicConfig(dynamic: DynamicRecord): PublicConfigParts {
  if (dynamic.kind === "consumption") {
    const config = readConsumptionConfig(dynamic.config);
    return {
      text: config?.text ?? "",
      goal_mode: config?.goal_mode ?? null,
      goal_amount: config?.goal_mode === "amount" ? config.goal_amount : null,
      min_ticket: config?.min_ticket ?? null,
      product_ids: config?.product_ids ?? [],
    };
  }

  const parsed = textConfigSchema.safeParse(dynamic.config);
  const text =
    dynamic.kind === "promo_code"
      ? (parsed.success ? parsed.data.benefit : "") ?? ""
      : (parsed.success ? parsed.data.text : "") ?? "";

  return {
    text: text ?? "",
    goal_mode: null,
    goal_amount: null,
    min_ticket: null,
    product_ids: [],
  };
}

export function goalMet(dynamic: DynamicRecord): boolean {
  switch (dynamic.kind) {
    case "time_promo":
      return false;
    case "going":
    case "qr":
      return (
        dynamic.goal_count != null && dynamic.progress_count >= dynamic.goal_count
      );
    case "promo_code":
      return dynamic.progress_count >= (dynamic.goal_count ?? 1);
    case "consumption": {
      const config = readConsumptionConfig(dynamic.config);
      if (!config) return false;
      if (config.goal_mode === "amount") {
        if (!config.goal_amount) return false;
        return dynamic.progress_amount.gte(config.goal_amount);
      }
      return (
        dynamic.goal_count != null && dynamic.progress_count >= dynamic.goal_count
      );
    }
    default:
      return false;
  }
}

/** Active dynamics close as exhausted when the quota is met, otherwise as expired once `now` is past `ends_at`. */
export function closeTransition(
  dynamic: DynamicRecord,
  now: Date
): "exhausted" | "expired" | null {
  if (dynamic.status !== "active") return null;
  if (goalMet(dynamic)) return "exhausted";
  if (dynamic.ends_at && now.getTime() > dynamic.ends_at.getTime()) {
    return "expired";
  }
  return null;
}

export function isUniqueConflict(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002"
  );
}

export function consumptionChargeMatches(
  dynamic: DynamicRecord,
  amount: Prisma.Decimal,
  productIds: ReadonlySet<string>
): boolean {
  const config = readConsumptionConfig(dynamic.config);
  if (!config) return false;
  if (config.min_ticket && amount.lt(config.min_ticket)) return false;
  if (
    config.product_ids.length > 0 &&
    !config.product_ids.some((id) => productIds.has(id))
  ) {
    return false;
  }
  return true;
}
