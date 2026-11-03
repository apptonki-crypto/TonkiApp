import { randomBytes } from "crypto";

import { z } from "zod";
import { Prisma } from "src/generated/prisma/client";

import {
  MAX_POST_DYNAMICS,
  type DynamicKind,
} from "src/lib/posts/dynamics/constants";

const dynamicText = z
  .string()
  .trim()
  .min(1, "Escribe el texto")
  .max(500, "Máximo 500 caracteres");

const promoCode = z
  .string()
  .trim()
  .min(1, "Escribe el código")
  .max(32, "Máximo 32 caracteres")
  .regex(
    /^[A-Za-z0-9_-]+$/,
    "El código solo puede tener letras, números, guion y guion bajo"
  )
  .transform((value) => value.toUpperCase());

const requiredDate = z.coerce.date({ error: "Fecha inválida" });

const optionalDate = z.union([z.null(), requiredDate]).optional();

const optionalGoalCount = z
  .union([
    z.number().int().min(1).max(1_000_000),
    z.null(),
  ])
  .optional();

const requiredGoalCount = z
  .number()
  .int("La meta debe ser un entero")
  .min(1, "La meta mínima es 1")
  .max(1_000_000, "La meta es demasiado alta");

function normalizeMoney(value: string | number): string | null {
  const raw = typeof value === "number" ? value.toString() : value.trim();
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(raw)) return null;
  const decimal = new Prisma.Decimal(raw);
  if (!decimal.gt(0)) return null;
  return decimal.toFixed(2);
}

function moneyField(invalid: string) {
  return z.union([z.string(), z.number()]).transform((value, ctx) => {
    const normalized = normalizeMoney(value);
    if (!normalized) {
      ctx.addIssue({ code: "custom", message: invalid });
      return z.NEVER;
    }
    return normalized;
  });
}

function optionalMoney(invalid: string) {
  return z
    .union([z.string(), z.number(), z.null()])
    .optional()
    .transform((value, ctx) => {
      if (value == null) return null;
      if (typeof value === "string" && value.trim() === "") return null;
      const normalized = normalizeMoney(value);
      if (!normalized) {
        ctx.addIssue({ code: "custom", message: invalid });
        return z.NEVER;
      }
      return normalized;
    });
}

type WindowValue = {
  starts_at?: Date | null;
  ends_at?: Date | null;
};

function windowIssue(value: WindowValue) {
  const starts = value.starts_at ?? null;
  const ends = value.ends_at ?? null;
  if (!starts || !ends || ends.getTime() > starts.getTime()) return null;
  return {
    code: "custom" as const,
    path: ["ends_at"],
    message: "La fecha de fin debe ser posterior al inicio",
    input: ends,
  };
}

export const timePromoCreateSchema = z
  .object({
    kind: z.literal("time_promo"),
    text: dynamicText,
    starts_at: requiredDate,
    ends_at: requiredDate,
  })
  .check((payload) => {
    const issue = windowIssue(payload.value);
    if (issue) payload.issues.push(issue);
  });

export const goingCreateSchema = z
  .object({
    kind: z.literal("going"),
    text: dynamicText,
    goal_count: optionalGoalCount,
    starts_at: optionalDate,
    ends_at: optionalDate,
  })
  .check((payload) => {
    const issue = windowIssue(payload.value);
    if (issue) payload.issues.push(issue);
  });

export const promoCodeCreateSchema = z
  .object({
    kind: z.literal("promo_code"),
    code: promoCode,
    max_redemptions: z
      .number()
      .int("Las redenciones deben ser un entero")
      .min(1, "El mínimo de redenciones es 1")
      .max(1_000_000, "Demasiadas redenciones")
      .optional()
      .default(1),
    benefit: dynamicText,
    starts_at: optionalDate,
    ends_at: optionalDate,
  })
  .check((payload) => {
    const issue = windowIssue(payload.value);
    if (issue) payload.issues.push(issue);
  });

export const qrCreateSchema = z
  .object({
    kind: z.literal("qr"),
    text: dynamicText,
    goal_count: requiredGoalCount,
    starts_at: optionalDate,
    ends_at: optionalDate,
  })
  .check((payload) => {
    const issue = windowIssue(payload.value);
    if (issue) payload.issues.push(issue);
  });

export const consumptionCreateSchema = z
  .object({
    kind: z.literal("consumption"),
    establishment_id: z.string().uuid("Establecimiento inválido"),
    text: z.union([dynamicText, z.null()]).optional(),
    goal_mode: z.enum(["count", "amount"], {
      error: "Elige meta por cobros o por monto",
    }),
    goal_count: optionalGoalCount,
    goal_amount: optionalMoney("Monto de meta inválido"),
    min_ticket: optionalMoney("Ticket mínimo inválido"),
    product_ids: z
      .array(z.string().uuid("Producto inválido"))
      .max(50, "Demasiados productos")
      .optional()
      .default([]),
    starts_at: optionalDate,
    ends_at: optionalDate,
  })
  .check((payload) => {
    const issue = windowIssue(payload.value);
    if (issue) payload.issues.push(issue);
    if (payload.value.goal_mode === "count" && payload.value.goal_count == null) {
      payload.issues.push({
        code: "custom",
        path: ["goal_count"],
        message: "Indica cuántos cobros cierran la dinámica",
        input: payload.value.goal_count,
      });
    }
    if (payload.value.goal_mode === "amount" && !payload.value.goal_amount) {
      payload.issues.push({
        code: "custom",
        path: ["goal_amount"],
        message: "Indica el monto que cierra la dinámica",
        input: payload.value.goal_amount,
      });
    }
  });

export const postDynamicCreateSchema = z.discriminatedUnion(
  "kind",
  [
    timePromoCreateSchema,
    goingCreateSchema,
    promoCodeCreateSchema,
    qrCreateSchema,
    consumptionCreateSchema,
  ],
  { error: "Tipo de dinámica inválido" }
);

export const postDynamicsCreateSchema = z
  .array(postDynamicCreateSchema)
  .max(MAX_POST_DYNAMICS, "Una publicación admite hasta 5 dinámicas");

export type PostDynamicCreateInput = z.output<typeof postDynamicCreateSchema>;

export type DynamicParseResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function failParse(error: z.ZodError): { ok: false; error: string } {
  return { ok: false, error: error.issues[0]?.message ?? "Dinámica inválida" };
}

export function parsePostDynamicCreate(
  input: unknown
): DynamicParseResult<PostDynamicCreateInput> {
  const parsed = postDynamicCreateSchema.safeParse(input);
  if (!parsed.success) return failParse(parsed.error);
  return { ok: true, data: parsed.data };
}

export function parsePostDynamicsCreate(
  input: unknown
): DynamicParseResult<PostDynamicCreateInput[]> {
  let value = input;
  if (typeof input === "string") {
    const trimmed = input.trim();
    if (trimmed === "") return { ok: true, data: [] };
    try {
      value = JSON.parse(trimmed) as unknown;
    } catch {
      return { ok: false, error: "Las dinámicas no tienen un JSON válido." };
    }
  }
  if (value == null) return { ok: true, data: [] };
  const parsed = postDynamicsCreateSchema.safeParse(value);
  if (!parsed.success) return failParse(parsed.error);
  return { ok: true, data: parsed.data };
}

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

export function createDynamicToken(): string {
  return randomBytes(24).toString("base64url");
}

export type PostDynamicWriteData = {
  kind: DynamicKind;
  status: "active";
  config: Prisma.InputJsonObject;
  progress_count: 0;
  progress_amount: Prisma.Decimal;
  goal_count: number | null;
  starts_at: Date | null;
  ends_at: Date | null;
  establishment_id: string | null;
  token: string | null;
};

function dateOrNull(value: Date | null | undefined): Date | null {
  return value ?? null;
}

function qrToken(explicit?: string): string {
  if (explicit == null || explicit === "") return createDynamicToken();
  if (!TOKEN_PATTERN.test(explicit)) {
    throw new Error("Token de QR inválido");
  }
  return explicit;
}

export function toPostDynamicWriteData(
  input: PostDynamicCreateInput,
  options?: { token?: string }
): PostDynamicWriteData {
  const base = {
    status: "active" as const,
    progress_count: 0 as const,
    progress_amount: new Prisma.Decimal(0),
    starts_at: dateOrNull(input.starts_at),
    ends_at: dateOrNull(input.ends_at),
  };

  switch (input.kind) {
    case "time_promo":
      return {
        ...base,
        kind: input.kind,
        config: { text: input.text },
        goal_count: null,
        establishment_id: null,
        token: null,
      };
    case "going":
      return {
        ...base,
        kind: input.kind,
        config: { text: input.text },
        goal_count: input.goal_count ?? null,
        establishment_id: null,
        token: null,
      };
    case "promo_code":
      return {
        ...base,
        kind: input.kind,
        config: { code: input.code, benefit: input.benefit },
        goal_count: input.max_redemptions,
        establishment_id: null,
        token: null,
      };
    case "qr":
      return {
        ...base,
        kind: input.kind,
        config: { text: input.text },
        goal_count: input.goal_count,
        establishment_id: null,
        token: qrToken(options?.token),
      };
    case "consumption":
      if (input.goal_mode === "count" && input.goal_count == null) {
        throw new Error("El consumo por cobros requiere una meta");
      }
      if (input.goal_mode === "amount" && !input.goal_amount) {
        throw new Error("El consumo por monto requiere una meta");
      }
      return {
        ...base,
        kind: input.kind,
        config: {
          text: input.text ?? null,
          goal_mode: input.goal_mode,
          goal_amount: input.goal_mode === "amount" ? input.goal_amount : null,
          min_ticket: input.min_ticket ?? null,
          product_ids: input.product_ids,
        },
        goal_count: input.goal_mode === "count" ? (input.goal_count ?? null) : null,
        establishment_id: input.establishment_id,
        token: null,
      };
    default: {
      const unreachable: never = input;
      return unreachable;
    }
  }
}
