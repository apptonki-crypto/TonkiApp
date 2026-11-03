import {
  DYNAMIC_PHASES,
  MAX_POST_DYNAMICS,
  isDynamicKind,
  isDynamicStatus,
  type DynamicKind,
  type DynamicPhase,
  type DynamicStatus,
} from "src/lib/posts/dynamics/constants";
export const DYNAMIC_KIND_LABEL: Record<DynamicKind, string> = {
  time_promo: "Tiempo",
  going: "Voy",
  promo_code: "Código",
  qr: "QR",
  consumption: "Consumo",
};

export const DYNAMIC_PHASE_LABEL: Record<DynamicPhase, string> = {
  upcoming: "Próximamente",
  active: "Activa",
  exhausted: "Agotada",
  expired: "Vencida",
};

const PROMO_CODE_STORAGE_KEY = "tonki.postPromoCodes";
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MONEY_RE = /^\d{1,10}(\.\d{1,2})?$/;
const CODE_RE = /^[A-Za-z0-9_-]+$/;

export type DynamicDraft =
  | {
      localId: string;
      kind: "time_promo";
      text: string;
      startsAt: string;
      endsAt: string;
    }
  | {
      localId: string;
      kind: "going";
      text: string;
      goalCount: string;
      startsAt: string;
      endsAt: string;
    }
  | {
      localId: string;
      kind: "promo_code";
      code: string;
      maxRedemptions: string;
      benefit: string;
      startsAt: string;
      endsAt: string;
    }
  | {
      localId: string;
      kind: "qr";
      text: string;
      goalCount: string;
      startsAt: string;
      endsAt: string;
    }
  | {
      localId: string;
      kind: "consumption";
      establishmentId: string;
      text: string;
      goalMode: "count" | "amount";
      goalCount: string;
      goalAmount: string;
      minTicket: string;
      productIds: string[];
      startsAt: string;
      endsAt: string;
    };

export type DynamicCreateJson =
  | {
      kind: "time_promo";
      text: string;
      starts_at: string;
      ends_at: string;
    }
  | {
      kind: "going";
      text: string;
      goal_count?: number;
      starts_at?: string;
      ends_at?: string;
    }
  | {
      kind: "promo_code";
      code: string;
      max_redemptions: number;
      benefit: string;
      starts_at?: string;
      ends_at?: string;
    }
  | {
      kind: "qr";
      text: string;
      goal_count: number;
      starts_at?: string;
      ends_at?: string;
    }
  | {
      kind: "consumption";
      establishment_id: string;
      text?: string;
      goal_mode: "count" | "amount";
      goal_count?: number;
      goal_amount?: string;
      min_ticket?: string;
      product_ids: string[];
      starts_at?: string;
      ends_at?: string;
    };

export type DynamicUpsertJson = DynamicCreateJson & { dynamic_id?: string };

export type DynamicPatchJson = {
  upserts?: DynamicUpsertJson[];
  close_ids?: string[];
  remove_ids?: string[];
};

export type NormalizedDynamic = {
  dynamic_id: string;
  post_id: string | null;
  kind: DynamicKind;
  status: DynamicStatus | null;
  phase: DynamicPhase;
  text: string;
  progress_count: number;
  progress_amount: string;
  goal_count: number | null;
  goal_amount: string | null;
  goal_mode: "count" | "amount" | null;
  starts_at: string | null;
  ends_at: string | null;
  closed_at: string | null;
  min_ticket: string | null;
  product_ids: string[];
  viewer_participated: boolean;
  code: string | null;
  participation_count: number | null;
  establishment_id: string | null;
};

type ClientResult<T> = { ok: true; data: T } | { ok: false; error: string };

export function newDynamicDraftId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function kindLabel(kind: DynamicKind): string {
  return DYNAMIC_KIND_LABEL[kind];
}

export function phaseLabel(phase: DynamicPhase): string {
  return DYNAMIC_PHASE_LABEL[phase];
}

export function createEmptyDraft(
  kind: DynamicKind,
  establishmentId: string | null
): DynamicDraft | null {
  const localId = newDynamicDraftId();
  switch (kind) {
    case "time_promo":
      return { localId, kind, text: "", startsAt: "", endsAt: "" };
    case "going":
      return { localId, kind, text: "", goalCount: "", startsAt: "", endsAt: "" };
    case "promo_code":
      return {
        localId,
        kind,
        code: "",
        maxRedemptions: "1",
        benefit: "",
        startsAt: "",
        endsAt: "",
      };
    case "qr":
      return { localId, kind, text: "", goalCount: "", startsAt: "", endsAt: "" };
    case "consumption":
      if (!establishmentId) return null;
      return {
        localId,
        kind,
        establishmentId,
        text: "",
        goalMode: "count",
        goalCount: "",
        goalAmount: "",
        minTicket: "",
        productIds: [],
        startsAt: "",
        endsAt: "",
      };
    default: {
      const unreachable: never = kind;
      return unreachable;
    }
  }
}

export function datetimeLocalToIso(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export function isoToDatetimeLocal(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function formatDateTimeEs(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("es", { dateStyle: "medium", timeStyle: "short" });
}

export function formatMoneyEs(amount: string | null | undefined): string {
  if (!amount) return "";
  const value = Number(amount);
  if (!Number.isFinite(value)) return amount;
  return value.toLocaleString("es-MX", { style: "currency", currency: "MXN" });
}

export function formatRemainingEs(ms: number): string {
  if (ms <= 0) return "El plazo ya terminó";
  const totalMinutes = Math.floor(ms / 60_000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `Quedan ${days} d ${hours} h`;
  if (hours > 0) return `Quedan ${hours} h ${minutes} min`;
  if (minutes > 0) return `Quedan ${minutes} min`;
  return "Queda menos de un minuto";
}

function parseRequiredText(raw: string): ClientResult<string> {
  const text = raw.trim();
  if (!text) return { ok: false, error: "Escribe el texto" };
  if (text.length > 500) return { ok: false, error: "Máximo 500 caracteres" };
  return { ok: true, data: text };
}

function parseOptionalText(raw: string): ClientResult<string | undefined> {
  const text = raw.trim();
  if (!text) return { ok: true, data: undefined };
  if (text.length > 500) return { ok: false, error: "Máximo 500 caracteres" };
  return { ok: true, data: text };
}

function parseCode(raw: string): ClientResult<string> {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, error: "Escribe el código" };
  if (trimmed.length > 32) return { ok: false, error: "Máximo 32 caracteres" };
  if (!CODE_RE.test(trimmed)) {
    return {
      ok: false,
      error: "El código solo puede tener letras, números, guion y guion bajo",
    };
  }
  return { ok: true, data: trimmed.toUpperCase() };
}

function parseOptionalCount(
  raw: string,
  emptyMessage: string
): ClientResult<number | undefined> {
  const trimmed = raw.trim();
  if (!trimmed) {
    return emptyMessage
      ? { ok: false, error: emptyMessage }
      : { ok: true, data: undefined };
  }
  if (!/^\d+$/.test(trimmed)) {
    return { ok: false, error: "La meta debe ser un entero" };
  }
  const value = Number(trimmed);
  if (value < 1) return { ok: false, error: "La meta mínima es 1" };
  if (value > 1_000_000) return { ok: false, error: "La meta es demasiado alta" };
  return { ok: true, data: value };
}

function parseRedemptions(raw: string): ClientResult<number> {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: true, data: 1 };
  if (!/^\d+$/.test(trimmed)) {
    return { ok: false, error: "Las redenciones deben ser un entero" };
  }
  const value = Number(trimmed);
  if (value < 1) return { ok: false, error: "El mínimo de redenciones es 1" };
  if (value > 1_000_000) return { ok: false, error: "Demasiadas redenciones" };
  return { ok: true, data: value };
}

function parseMoney(
  raw: string,
  invalid: string,
  required: boolean
): ClientResult<string | undefined> {
  const trimmed = raw.trim();
  if (!trimmed) {
    return required
      ? { ok: false, error: invalid }
      : { ok: true, data: undefined };
  }
  if (!MONEY_RE.test(trimmed) || Number(trimmed) <= 0) {
    return { ok: false, error: invalid };
  }
  return { ok: true, data: trimmed };
}

function parseWindow(
  startsAt: string,
  endsAt: string,
  required: boolean
): ClientResult<{ starts_at?: string; ends_at?: string }> {
  const starts = datetimeLocalToIso(startsAt);
  const ends = datetimeLocalToIso(endsAt);
  if (startsAt.trim() && !starts) return { ok: false, error: "Fecha inválida" };
  if (endsAt.trim() && !ends) return { ok: false, error: "Fecha inválida" };
  if (required && (!starts || !ends)) return { ok: false, error: "Fecha inválida" };
  if (starts && ends && new Date(ends).getTime() <= new Date(starts).getTime()) {
    return { ok: false, error: "La fecha de fin debe ser posterior al inicio" };
  }
  return {
    ok: true,
    data: {
      ...(starts ? { starts_at: starts } : {}),
      ...(ends ? { ends_at: ends } : {}),
    },
  };
}

function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

export function buildDynamicCreate(draft: DynamicDraft): ClientResult<DynamicCreateJson> {
  const prefix = `${kindLabel(draft.kind)}: `;
  const fail = (error: string): ClientResult<DynamicCreateJson> => ({
    ok: false,
    error: `${prefix}${error}`,
  });

  if (draft.kind === "time_promo") {
    const text = parseRequiredText(draft.text);
    if (!text.ok) return fail(text.error);
    const window = parseWindow(draft.startsAt, draft.endsAt, true);
    if (!window.ok) return fail(window.error);
    if (!window.data.starts_at || !window.data.ends_at) return fail("Fecha inválida");
    return {
      ok: true,
      data: {
        kind: "time_promo",
        text: text.data,
        starts_at: window.data.starts_at,
        ends_at: window.data.ends_at,
      },
    };
  }

  if (draft.kind === "going") {
    const text = parseRequiredText(draft.text);
    if (!text.ok) return fail(text.error);
    const goal = parseOptionalCount(draft.goalCount, "");
    if (!goal.ok) return fail(goal.error);
    const window = parseWindow(draft.startsAt, draft.endsAt, false);
    if (!window.ok) return fail(window.error);
    return {
      ok: true,
      data: {
        kind: "going",
        text: text.data,
        ...(goal.data != null ? { goal_count: goal.data } : {}),
        ...window.data,
      },
    };
  }

  if (draft.kind === "promo_code") {
    const code = parseCode(draft.code);
    if (!code.ok) return fail(code.error);
    const redemptions = parseRedemptions(draft.maxRedemptions);
    if (!redemptions.ok) return fail(redemptions.error);
    const benefit = parseRequiredText(draft.benefit);
    if (!benefit.ok) return fail(benefit.error === "Escribe el texto" ? "Escribe el texto" : benefit.error);
    const window = parseWindow(draft.startsAt, draft.endsAt, false);
    if (!window.ok) return fail(window.error);
    return {
      ok: true,
      data: {
        kind: "promo_code",
        code: code.data,
        max_redemptions: redemptions.data,
        benefit: benefit.data,
        ...window.data,
      },
    };
  }

  if (draft.kind === "qr") {
    const text = parseRequiredText(draft.text);
    if (!text.ok) return fail(text.error);
    const goal = parseOptionalCount(
      draft.goalCount,
      draft.goalCount.trim() ? "" : "Indica la meta de escaneos"
    );
    if (!goal.ok) return fail(goal.error);
    if (goal.data == null) return fail("Indica la meta de escaneos");
    const window = parseWindow(draft.startsAt, draft.endsAt, false);
    if (!window.ok) return fail(window.error);
    return {
      ok: true,
      data: {
        kind: "qr",
        text: text.data,
        goal_count: goal.data,
        ...window.data,
      },
    };
  }

  const text = parseOptionalText(draft.text);
  if (!text.ok) return fail(text.error);
  if (!isUuid(draft.establishmentId)) return fail("Establecimiento inválido");
  const window = parseWindow(draft.startsAt, draft.endsAt, false);
  if (!window.ok) return fail(window.error);
  if (draft.productIds.length > 50) return fail("Demasiados productos");
  if (draft.productIds.some((id) => !isUuid(id))) return fail("Producto inválido");

  if (draft.goalMode === "count") {
    const goal = parseOptionalCount(
      draft.goalCount,
      "Indica cuántos cobros cierran la dinámica"
    );
    if (!goal.ok) return fail(goal.error);
    if (goal.data == null) return fail("Indica cuántos cobros cierran la dinámica");
    const minTicket = parseMoney(draft.minTicket, "Ticket mínimo inválido", false);
    if (!minTicket.ok) return fail(minTicket.error);
    return {
      ok: true,
      data: {
        kind: "consumption",
        establishment_id: draft.establishmentId,
        ...(text.data ? { text: text.data } : {}),
        goal_mode: "count",
        goal_count: goal.data,
        ...(minTicket.data ? { min_ticket: minTicket.data } : {}),
        product_ids: draft.productIds,
        ...window.data,
      },
    };
  }

  const amount = parseMoney(
    draft.goalAmount,
    draft.goalAmount.trim() ? "Monto de meta inválido" : "Indica el monto que cierra la dinámica",
    true
  );
  if (!amount.ok) return fail(amount.error);
  if (!amount.data) return fail("Indica el monto que cierra la dinámica");
  const minTicket = parseMoney(draft.minTicket, "Ticket mínimo inválido", false);
  if (!minTicket.ok) return fail(minTicket.error);
  return {
    ok: true,
    data: {
      kind: "consumption",
      establishment_id: draft.establishmentId,
      ...(text.data ? { text: text.data } : {}),
      goal_mode: "amount",
      goal_amount: amount.data,
      ...(minTicket.data ? { min_ticket: minTicket.data } : {}),
      product_ids: draft.productIds,
      ...window.data,
    },
  };
}

export function buildDynamicCreates(
  drafts: readonly DynamicDraft[]
): ClientResult<DynamicCreateJson[]> {
  if (drafts.length > MAX_POST_DYNAMICS) {
    return { ok: false, error: "Una publicación admite hasta 5 dinámicas" };
  }
  const items: DynamicCreateJson[] = [];
  for (const draft of drafts) {
    const built = buildDynamicCreate(draft);
    if (!built.ok) return built;
    items.push(built.data);
  }
  return { ok: true, data: items };
}

export function draftFromDynamic(
  dynamic: NormalizedDynamic,
  extras?: { code?: string | null; establishmentId?: string | null }
): DynamicDraft | null {
  const localId = dynamic.dynamic_id || newDynamicDraftId();
  const startsAt = isoToDatetimeLocal(dynamic.starts_at);
  const endsAt = isoToDatetimeLocal(dynamic.ends_at);
  switch (dynamic.kind) {
    case "time_promo":
      return { localId, kind: "time_promo", text: dynamic.text, startsAt, endsAt };
    case "going":
      return {
        localId,
        kind: "going",
        text: dynamic.text,
        goalCount: dynamic.goal_count != null ? String(dynamic.goal_count) : "",
        startsAt,
        endsAt,
      };
    case "promo_code": {
      const code = extras?.code ?? dynamic.code;
      if (!code) return null;
      return {
        localId,
        kind: "promo_code",
        code,
        maxRedemptions:
          dynamic.goal_count != null ? String(dynamic.goal_count) : "1",
        benefit: dynamic.text,
        startsAt,
        endsAt,
      };
    }
    case "qr":
      return {
        localId,
        kind: "qr",
        text: dynamic.text,
        goalCount: dynamic.goal_count != null ? String(dynamic.goal_count) : "",
        startsAt,
        endsAt,
      };
    case "consumption": {
      const establishmentId =
        dynamic.establishment_id ?? extras?.establishmentId ?? "";
      if (!establishmentId) return null;
      return {
        localId,
        kind: "consumption",
        establishmentId,
        text: dynamic.text,
        goalMode: dynamic.goal_mode === "amount" ? "amount" : "count",
        goalCount: dynamic.goal_count != null ? String(dynamic.goal_count) : "",
        goalAmount: dynamic.goal_amount ?? "",
        minTicket: dynamic.min_ticket ?? "",
        productIds: [...dynamic.product_ids],
        startsAt,
        endsAt,
      };
    }
    default: {
      const unreachable: never = dynamic.kind;
      return unreachable;
    }
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function readCount(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && /^-?\d+$/.test(value.trim())) {
    return Number(value.trim());
  }
  return null;
}

function readFlag(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (value === 1 || value === "true") return true;
  if (value === 0 || value === "false") return false;
  return null;
}

function readPhase(
  value: unknown,
  status: DynamicStatus | null,
  startsAt: string | null
): DynamicPhase {
  if (typeof value === "string" && (DYNAMIC_PHASES as readonly string[]).includes(value)) {
    return value as DynamicPhase;
  }
  if (status === "exhausted") return "exhausted";
  if (status === "expired") return "expired";
  if (startsAt) {
    const time = new Date(startsAt).getTime();
    if (!Number.isNaN(time) && time > Date.now()) return "upcoming";
  }
  return "active";
}

function readCode(record: Record<string, unknown>): string | null {
  const raw = record.code ?? record.promo_code ?? record.promoCode;
  const code = readString(raw);
  return code ? code.toUpperCase() : null;
}

function readStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function readParticipationCount(record: Record<string, unknown>): number | null {
  const raw = record.participation_count ?? record.participationCount;
  const direct = readCount(raw);
  if (direct != null && direct >= 0) return direct;
  const counted = asRecord(record._count);
  const nested = counted ? readCount(counted.participations) : null;
  if (nested != null && nested >= 0) return nested;
  return null;
}

export function normalizeDynamic(
  value: unknown,
  options?: { includeAuthorSecrets?: boolean }
): NormalizedDynamic | null {
  const record = asRecord(value);
  if (!record) return null;
  const kindRaw = readString(record.kind);
  if (!kindRaw || !isDynamicKind(kindRaw)) return null;
  const dynamicId = readString(record.dynamic_id) ?? readString(record.dynamicId);
  if (!dynamicId) return null;
  const config = asRecord(record.config);
  const statusRaw = readString(record.status);
  const status = statusRaw && isDynamicStatus(statusRaw) ? statusRaw : null;
  const startsAt = readString(record.starts_at) ?? readString(record.startsAt);
  const goalModeRaw =
    readString(record.goal_mode) ??
    readString(record.goalMode) ??
    (config ? readString(config.goal_mode) : null);
  const goalMode =
    goalModeRaw === "count" || goalModeRaw === "amount" ? goalModeRaw : null;
  const topProducts = readStringList(record.product_ids ?? record.productIds);
  const productIds =
    topProducts.length > 0
      ? topProducts
      : config
        ? readStringList(config.product_ids)
        : [];
  const progressAmountRaw = record.progress_amount ?? record.progressAmount;
  const progressAmount =
    typeof progressAmountRaw === "number" && Number.isFinite(progressAmountRaw)
      ? progressAmountRaw.toFixed(2)
      : readString(progressAmountRaw) ?? "0.00";
  const viewer =
    readFlag(record.viewer_participated) ??
    readFlag(record.viewerParticipated) ??
    false;
  const secretCode =
    options?.includeAuthorSecrets && config ? readString(config.code) : null;

  return {
    dynamic_id: dynamicId,
    post_id: readString(record.post_id) ?? readString(record.postId),
    kind: kindRaw,
    status,
    phase: readPhase(record.phase, status, startsAt),
    text:
      readString(record.text) ??
      readString(record.benefit) ??
      (config ? readString(config.text) ?? readString(config.benefit) : null) ??
      "",
    progress_count: Math.max(
      0,
      readCount(record.progress_count) ?? readCount(record.progressCount) ?? 0
    ),
    progress_amount: progressAmount,
    goal_count: readCount(record.goal_count) ?? readCount(record.goalCount),
    goal_amount:
      readString(record.goal_amount) ??
      readString(record.goalAmount) ??
      (config ? readString(config.goal_amount) : null),
    goal_mode: goalMode,
    starts_at: startsAt,
    ends_at: readString(record.ends_at) ?? readString(record.endsAt),
    closed_at: readString(record.closed_at) ?? readString(record.closedAt),
    min_ticket:
      readString(record.min_ticket) ??
      readString(record.minTicket) ??
      (config ? readString(config.min_ticket) : null),
    product_ids: productIds,
    viewer_participated: viewer,
    code: readCode(record) ?? (secretCode ? secretCode.toUpperCase() : null),
    participation_count: readParticipationCount(record),
    establishment_id:
      readString(record.establishment_id) ?? readString(record.establishmentId),
  };
}

export function normalizePostDynamics(
  value: unknown,
  options?: { includeAuthorSecrets?: boolean }
): NormalizedDynamic[] {
  const list = Array.isArray(value) ? value : asRecord(value)?.dynamics;
  if (!Array.isArray(list)) return [];
  return list.flatMap((item) => {
    const normalized = normalizeDynamic(item, options);
    return normalized ? [normalized] : [];
  });
}

export function allDynamicsClosed(dynamics: readonly NormalizedDynamic[]): boolean {
  return (
    dynamics.length > 0 &&
    dynamics.every(
      (dynamic) => dynamic.phase === "exhausted" || dynamic.phase === "expired"
    )
  );
}

export function canParticipate(dynamic: NormalizedDynamic): boolean {
  return dynamic.phase === "active" && !dynamic.viewer_participated;
}

export function hasNoParticipations(dynamic: NormalizedDynamic): boolean {
  if (dynamic.participation_count != null) return dynamic.participation_count === 0;
  const amount = Number(dynamic.progress_amount);
  const amountZero = !Number.isFinite(amount) || amount === 0;
  return dynamic.progress_count === 0 && amountZero;
}

export function canEditDynamicConfig(dynamic: NormalizedDynamic): boolean {
  if (dynamic.phase !== "active") return false;
  if (dynamic.status != null && dynamic.status !== "active") return false;
  return hasNoParticipations(dynamic);
}

export function canManualClose(dynamic: NormalizedDynamic): boolean {
  if (dynamic.phase === "exhausted" || dynamic.phase === "expired") return false;
  if (dynamic.status === "exhausted" || dynamic.status === "expired") return false;
  return dynamic.phase === "active" || dynamic.phase === "upcoming";
}

export function dynamicProgressText(dynamic: NormalizedDynamic): string | null {
  if (dynamic.kind === "time_promo") return null;
  if (dynamic.kind === "consumption" && dynamic.goal_mode === "amount") {
    const current = formatMoneyEs(dynamic.progress_amount);
    return dynamic.goal_amount
      ? `${current} de ${formatMoneyEs(dynamic.goal_amount)}`
      : current;
  }
  const noun =
    dynamic.kind === "going"
      ? dynamic.goal_count != null
        ? "asistencias"
        : dynamic.progress_count === 1
          ? "persona"
          : "personas"
      : dynamic.kind === "qr"
        ? "escaneos"
        : dynamic.kind === "promo_code"
          ? "canjes"
          : "cobros";
  if (dynamic.goal_count != null) {
    return `${dynamic.progress_count} / ${dynamic.goal_count} ${noun}`;
  }
  return `${dynamic.progress_count} ${noun}`;
}

export function dynamicScheduleText(
  dynamic: NormalizedDynamic,
  nowMs: number
): string | null {
  if (dynamic.phase === "upcoming" && dynamic.starts_at) {
    return `Empieza el ${formatDateTimeEs(dynamic.starts_at)}`;
  }
  if (dynamic.phase === "expired") {
    const when = dynamic.ends_at ?? dynamic.closed_at;
    return when ? `Venció el ${formatDateTimeEs(when)}` : null;
  }
  if (dynamic.kind === "time_promo" && dynamic.ends_at && dynamic.phase === "active") {
    const remaining = new Date(dynamic.ends_at).getTime() - nowMs;
    return `${formatRemainingEs(remaining)} · Termina el ${formatDateTimeEs(dynamic.ends_at)}`;
  }
  if (dynamic.ends_at && dynamic.phase === "active") {
    return `Hasta el ${formatDateTimeEs(dynamic.ends_at)}`;
  }
  return null;
}

export function markViewerParticipated(dynamic: NormalizedDynamic): NormalizedDynamic {
  const progressCount =
    dynamic.kind === "going" || dynamic.kind === "promo_code" || dynamic.kind === "qr"
      ? dynamic.progress_count + 1
      : dynamic.progress_count;
  const reachedGoal =
    dynamic.goal_count != null && progressCount >= dynamic.goal_count;
  const phase = reachedGoal ? "exhausted" : dynamic.phase;
  return {
    ...dynamic,
    viewer_participated: true,
    progress_count: progressCount,
    phase,
    status: phase === "exhausted" ? "exhausted" : dynamic.status,
  };
}

type StoredPromoCodes = Record<
  string,
  { byId?: Record<string, string>; ordered?: string[] }
>;

function readPromoStore(): StoredPromoCodes {
  if (typeof sessionStorage === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(PROMO_CODE_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as StoredPromoCodes;
  } catch {
    return {};
  }
}

export function rememberPublishedPromoCodes(
  postId: string,
  input: { ordered: string[]; byId?: Record<string, string> }
): void {
  if (typeof sessionStorage === "undefined" || !postId) return;
  const store = readPromoStore();
  const prev = store[postId] ?? {};
  store[postId] = {
    ordered: input.ordered.length > 0 ? input.ordered : prev.ordered,
    byId: { ...prev.byId, ...input.byId },
  };
  sessionStorage.setItem(PROMO_CODE_STORAGE_KEY, JSON.stringify(store));
}

export function recallPromoCode(
  postId: string,
  dynamicId: string,
  promoIndex: number
): string | null {
  const entry = readPromoStore()[postId];
  if (!entry) return null;
  const byId = entry.byId?.[dynamicId];
  if (typeof byId === "string" && byId.trim()) return byId.trim().toUpperCase();
  const ordered = entry.ordered?.[promoIndex];
  if (typeof ordered === "string" && ordered.trim()) return ordered.trim().toUpperCase();
  return null;
}

export function readPublishResult(payload: unknown): {
  postId: string | null;
  dynamics: NormalizedDynamic[];
} {
  const record = asRecord(payload);
  if (!record) return { postId: null, dynamics: [] };
  const post = asRecord(record.post);
  const postId =
    readString(record.postId) ??
    readString(record.post_id) ??
    (post ? readString(post.post_id) ?? readString(post.postId) : null);
  const dynamics = normalizePostDynamics(record.dynamics ?? post?.dynamics);
  return { postId, dynamics };
}

export function readParticipateResult(
  payload: unknown,
  httpOk: boolean
): { ok: true; dynamic: NormalizedDynamic | null; message: string | null } | { ok: false; error: string } {
  const record = asRecord(payload);
  const error =
    (record && readString(record.error)) || "No se pudo participar.";
  if (!httpOk || record?.success === false || record?.ok === false) {
    return { ok: false, error };
  }
  const dynamic = record ? normalizeDynamic(record.dynamic) : null;
  return {
    ok: true,
    dynamic,
    message: record ? readString(record.message) : null,
  };
}

export function readQrImage(payload: unknown): string | null {
  const record = asRecord(payload);
  if (!record || record.success === false) return null;
  return readString(record.qr_image) ?? readString(record.qrImage);
}

export function readClaimResult(
  payload: unknown,
  httpOk: boolean
): { ok: true; message: string } | { ok: false; error: string; status: number } {
  const record = asRecord(payload);
  const error = (record && readString(record.error)) || "No se pudo registrar la participación.";
  if (!httpOk || record?.success === false || record?.ok === false) {
    return { ok: false, error, status: httpOk ? 400 : 0 };
  }
  const dynamic = record ? normalizeDynamic(record.dynamic) : null;
  const message =
    (record && readString(record.message)) ||
    (dynamic?.text ? `Listo. ${dynamic.text}` : "Participación registrada.");
  return { ok: true, message };
}
