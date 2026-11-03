export const MAX_POST_DYNAMICS = 5;

export const DYNAMIC_KINDS = [
  "time_promo",
  "going",
  "promo_code",
  "qr",
  "consumption",
] as const;

export type DynamicKind = (typeof DYNAMIC_KINDS)[number];

export const DYNAMIC_STATUSES = ["active", "exhausted", "expired"] as const;

export type DynamicStatus = (typeof DYNAMIC_STATUSES)[number];

export const PARTICIPATION_SOURCES = [
  "going",
  "promo_code",
  "qr",
  "charge",
] as const;

export type ParticipationSource = (typeof PARTICIPATION_SOURCES)[number];

export const DYNAMIC_PHASES = [
  "upcoming",
  "active",
  "exhausted",
  "expired",
] as const;

export type DynamicPhase = (typeof DYNAMIC_PHASES)[number];

const KIND_SET = new Set<string>(DYNAMIC_KINDS);
const STATUS_SET = new Set<string>(DYNAMIC_STATUSES);

export function isDynamicKind(value: string): value is DynamicKind {
  return KIND_SET.has(value);
}

export function isDynamicStatus(value: string): value is DynamicStatus {
  return STATUS_SET.has(value);
}

/** Public path opened by the dynamic QR. The token is not part of the feed payload. */
export function dynamicClaimPath(token: string): string {
  return `/dinamica/${token}`;
}
