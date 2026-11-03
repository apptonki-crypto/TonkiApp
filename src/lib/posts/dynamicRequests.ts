import { z } from "zod";

import {
  MAX_POST_DYNAMICS,
  dynamicClaimPath,
  parsePostDynamicCreate,
  parsePostDynamicsCreate,
  type DynamicKind,
  type DynamicStatus,
  type PostDynamicCreateInput,
} from "src/lib/posts/dynamics";

export const MISSING_CONSUMPTION_ESTABLISHMENT =
  "Completa el perfil del negocio para crear una dinámica de consumo.";

export const DYNAMIC_PATCH_MAX_MESSAGE =
  "Una publicación admite hasta 5 dinámicas";

export const DYNAMIC_KIND_LOCKED_MESSAGE =
  "No se puede cambiar el tipo de dinámica.";

export const DYNAMIC_REMOVE_BLOCKED_MESSAGE =
  "No se puede eliminar una dinámica que ya tiene participaciones.";

export const DYNAMIC_NOT_FOUND_MESSAGE = "Dinámica no encontrada.";

const DYNAMIC_JSON_MESSAGE = "Las dinámicas no tienen un JSON válido.";
const DYNAMIC_INVALID_MESSAGE = "Dinámicas inválidas.";
const DYNAMIC_ITEM_INVALID_MESSAGE = "Dinámica inválida.";
const DYNAMIC_REPEATED_MESSAGE = "La dinámica está repetida.";
const DYNAMIC_EDIT_AND_REMOVE_MESSAGE =
  "No puedes editar y eliminar la misma dinámica.";
const DYNAMIC_CLOSE_AND_REMOVE_MESSAGE =
  "No puedes cerrar y eliminar la misma dinámica.";

/** Sentinel so a consumption row can pass schema parse when the edit will be ignored. Never persisted. */
const UNRESOLVED_ESTABLISHMENT_ID = "00000000-0000-4000-8000-000000000000";

const CLAIM_TOKEN = /^[A-Za-z0-9_-]{16,64}$/;

const uuidListSchema = z.array(z.string().uuid()).max(MAX_POST_DYNAMICS);

const patchEnvelopeSchema = z.object({
  upserts: z.array(z.unknown()).max(MAX_POST_DYNAMICS).optional(),
  close_ids: uuidListSchema.optional(),
  remove_ids: uuidListSchema.optional(),
});

export class PostDynamicRequestError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "PostDynamicRequestError";
    this.status = status;
  }
}

export type ExistingDynamic = {
  dynamic_id: string;
  kind: DynamicKind;
  status: DynamicStatus;
  participation_count: number;
  establishment_id: string | null;
  token: string | null;
};

export type ParsedDynamicUpsert = {
  dynamic_id?: string;
  input: PostDynamicCreateInput;
};

export type ParsedDynamicsPatch = {
  upserts: ParsedDynamicUpsert[];
  close_ids: string[];
  remove_ids: string[];
};

export type DynamicPatchOp =
  | { type: "create"; input: PostDynamicCreateInput }
  | {
      type: "replace";
      dynamic_id: string;
      input: PostDynamicCreateInput;
      token: string | null;
    }
  | { type: "close"; dynamic_id: string }
  | { type: "remove"; dynamic_id: string };

export type DynamicPatchFailure = {
  ok: false;
  status: number;
  error: string;
};

export type DynamicPatchSuccess = {
  ok: true;
  ops: DynamicPatchOp[];
  patch: ParsedDynamicsPatch;
};

function fail(status: number, error: string): DynamicPatchFailure {
  return { ok: false, status, error };
}

export function isDynamicClaimToken(token: string): boolean {
  return CLAIM_TOKEN.test(token);
}

export function dynamicClaimUrl(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, "")}${dynamicClaimPath(token)}`;
}

export function isUnresolvedEstablishment(establishmentId: string | null): boolean {
  return (
    establishmentId == null || establishmentId === UNRESOLVED_ESTABLISHMENT_ID
  );
}

function coerceJson(input: unknown): { ok: true; value: unknown } | DynamicPatchFailure {
  if (typeof input !== "string") return { ok: true, value: input };
  const trimmed = input.trim();
  if (trimmed === "") return { ok: true, value: undefined };
  try {
    return { ok: true, value: JSON.parse(trimmed) as unknown };
  } catch {
    return fail(400, DYNAMIC_JSON_MESSAGE);
  }
}

function listHasConsumption(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.some(
      (item) =>
        !!item &&
        typeof item === "object" &&
        (item as { kind?: unknown }).kind === "consumption"
    )
  );
}

export function parseCreateDynamicsField(
  raw: unknown,
  establishmentId: string | null
): { ok: true; data: PostDynamicCreateInput[] } | { ok: false; error: string } {
  if (raw == null) return { ok: true, data: [] };
  const coerced = coerceJson(raw);
  if (!coerced.ok) return { ok: false, error: coerced.error };
  if (coerced.value == null) return { ok: true, data: [] };
  if (!Array.isArray(coerced.value)) {
    return { ok: false, error: DYNAMIC_INVALID_MESSAGE };
  }
  const items: unknown[] = coerced.value;
  if (!listHasConsumption(items)) return parsePostDynamicsCreate(items);
  if (!establishmentId || isUnresolvedEstablishment(establishmentId)) {
    return { ok: false, error: MISSING_CONSUMPTION_ESTABLISHMENT };
  }
  const stamped = items.map((item: unknown) => {
    if (
      item &&
      typeof item === "object" &&
      (item as { kind?: unknown }).kind === "consumption"
    ) {
      return { ...(item as object), establishment_id: establishmentId };
    }
    return item;
  });
  return parsePostDynamicsCreate(stamped);
}

function envelopeError(error: z.ZodError): DynamicPatchFailure {
  const tooBig = error.issues.some((issue) => issue.code === "too_big");
  return fail(400, tooBig ? DYNAMIC_PATCH_MAX_MESSAGE : DYNAMIC_INVALID_MESSAGE);
}

function asRecord(item: unknown): Record<string, unknown> | null {
  if (!item || typeof item !== "object" || Array.isArray(item)) return null;
  return item as Record<string, unknown>;
}

/**
 * Author establishment for a consumption create.
 * Replacements keep the row's establishment when the admin profile cannot be resolved.
 * Returns null when this item is not consumption.
 */
function consumptionEstablishmentForUpsert(
  item: Record<string, unknown>,
  dynamicId: string | undefined,
  existingById: Map<string, ExistingDynamic>,
  authorEstablishmentId: string | null
): { ok: true; establishmentId: string | null } | DynamicPatchFailure {
  if (item.kind !== "consumption") return { ok: true, establishmentId: null };

  const row = dynamicId ? existingById.get(dynamicId) : undefined;
  const author = isUnresolvedEstablishment(authorEstablishmentId)
    ? null
    : authorEstablishmentId;

  if (!dynamicId) {
    if (!author) return fail(400, MISSING_CONSUMPTION_ESTABLISHMENT);
    return { ok: true, establishmentId: author };
  }

  const editable =
    row?.kind === "consumption" &&
    row.status === "active" &&
    row.participation_count === 0;
  if (editable) {
    const resolved = author ?? row.establishment_id;
    if (isUnresolvedEstablishment(resolved)) {
      return fail(400, MISSING_CONSUMPTION_ESTABLISHMENT);
    }
    return { ok: true, establishmentId: resolved };
  }

  const ignored = author ?? row?.establishment_id ?? UNRESOLVED_ESTABLISHMENT_ID;
  return { ok: true, establishmentId: ignored };
}

function parseUpserts(
  rawUpserts: unknown[],
  existingById: Map<string, ExistingDynamic>,
  authorEstablishmentId: string | null
): { ok: true; upserts: ParsedDynamicUpsert[] } | DynamicPatchFailure {
  const upserts: ParsedDynamicUpsert[] = [];
  for (const raw of rawUpserts) {
    const item = asRecord(raw);
    if (!item) return fail(400, DYNAMIC_ITEM_INVALID_MESSAGE);

    let dynamicId: string | undefined;
    if ("dynamic_id" in item && item.dynamic_id !== undefined) {
      const id = z.string().uuid().safeParse(item.dynamic_id);
      if (!id.success) return fail(400, DYNAMIC_ITEM_INVALID_MESSAGE);
      dynamicId = id.data;
    }

    const stamped = consumptionEstablishmentForUpsert(
      item,
      dynamicId,
      existingById,
      authorEstablishmentId
    );
    if (!stamped.ok) return stamped;

    const payload: Record<string, unknown> = { ...item };
    delete payload.dynamic_id;
    if (stamped.establishmentId != null) {
      payload.establishment_id = stamped.establishmentId;
    }
    const parsed = parsePostDynamicCreate(payload);
    if (!parsed.ok) return fail(400, parsed.error);
    upserts.push({ dynamic_id: dynamicId, input: parsed.data });
  }
  return { ok: true, upserts };
}

export function planDynamicPatch(
  existing: readonly ExistingDynamic[],
  patch: ParsedDynamicsPatch
): { ok: true; ops: DynamicPatchOp[] } | DynamicPatchFailure {
  const byId = new Map(existing.map((row) => [row.dynamic_id, row]));
  const removeIds = [...new Set(patch.remove_ids)];
  const closeIds = [...new Set(patch.close_ids)];
  const removeSet = new Set(removeIds);
  const closeSet = new Set(closeIds);

  for (const id of removeIds) {
    if (!byId.has(id)) return fail(400, DYNAMIC_NOT_FOUND_MESSAGE);
    if (closeSet.has(id)) return fail(400, DYNAMIC_CLOSE_AND_REMOVE_MESSAGE);
    const row = byId.get(id);
    if (row && row.participation_count > 0) {
      return fail(409, DYNAMIC_REMOVE_BLOCKED_MESSAGE);
    }
  }
  for (const id of closeIds) {
    if (!byId.has(id)) return fail(400, DYNAMIC_NOT_FOUND_MESSAGE);
  }

  const ops: DynamicPatchOp[] = removeIds.map((dynamic_id) => ({
    type: "remove",
    dynamic_id,
  }));

  const seen = new Set<string>();
  let creates = 0;
  for (const upsert of patch.upserts) {
    if (!upsert.dynamic_id) {
      creates += 1;
      ops.push({ type: "create", input: upsert.input });
      continue;
    }
    if (seen.has(upsert.dynamic_id)) return fail(400, DYNAMIC_REPEATED_MESSAGE);
    seen.add(upsert.dynamic_id);
    if (removeSet.has(upsert.dynamic_id)) {
      return fail(400, DYNAMIC_EDIT_AND_REMOVE_MESSAGE);
    }
    const row = byId.get(upsert.dynamic_id);
    if (!row) return fail(400, DYNAMIC_NOT_FOUND_MESSAGE);
    if (row.kind !== upsert.input.kind) {
      return fail(409, DYNAMIC_KIND_LOCKED_MESSAGE);
    }
    if (row.status !== "active" || row.participation_count > 0) continue;
    ops.push({
      type: "replace",
      dynamic_id: upsert.dynamic_id,
      input: upsert.input,
      token: row.token,
    });
  }

  for (const id of closeIds) {
    const row = byId.get(id);
    if (!row || row.status !== "active") continue;
    ops.push({ type: "close", dynamic_id: id });
  }

  const finalCount = existing.length - removeIds.length + creates;
  if (finalCount > MAX_POST_DYNAMICS) {
    return fail(400, DYNAMIC_PATCH_MAX_MESSAGE);
  }
  return { ok: true, ops };
}

export function interpretDynamicsPatch(
  raw: unknown,
  existing: readonly ExistingDynamic[],
  authorEstablishmentId: string | null
): DynamicPatchSuccess | DynamicPatchFailure {
  const coerced = coerceJson(raw);
  if (!coerced.ok) return coerced;
  if (coerced.value == null) {
    return {
      ok: true,
      ops: [],
      patch: { upserts: [], close_ids: [], remove_ids: [] },
    };
  }

  const envelope = patchEnvelopeSchema.safeParse(coerced.value);
  if (!envelope.success) return envelopeError(envelope.error);

  const existingById = new Map(existing.map((row) => [row.dynamic_id, row]));
  const upserts = parseUpserts(
    envelope.data.upserts ?? [],
    existingById,
    authorEstablishmentId
  );
  if (!upserts.ok) return upserts;

  const patch: ParsedDynamicsPatch = {
    upserts: upserts.upserts,
    close_ids: envelope.data.close_ids ?? [],
    remove_ids: envelope.data.remove_ids ?? [],
  };
  const planned = planDynamicPatch(existing, patch);
  if (!planned.ok) return planned;
  return { ok: true, ops: planned.ops, patch };
}

export type ParticipateBody =
  | { ok: true; source: "going"; code?: undefined }
  | { ok: true; source: "promo_code"; code: string }
  | DynamicPatchFailure;

export function parseParticipateBody(input: unknown): ParticipateBody {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return fail(400, "Datos inválidos.");
  }
  const source = (input as { source?: unknown }).source;
  if (source === "qr") {
    return fail(400, "El código QR se reclama desde su enlace.");
  }
  if (source === "going") return { ok: true, source: "going" };
  if (source === "promo_code") {
    const code = (input as { code?: unknown }).code;
    if (typeof code !== "string") return fail(400, "El código no coincide.");
    return { ok: true, source: "promo_code", code };
  }
  return fail(400, "Datos inválidos.");
}
