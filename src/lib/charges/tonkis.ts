import { CHARGE_TTL_MS } from "src/lib/charges/constants";

const PESOS_INPUT = /^(\d{1,6})(?:\.(\d{1,2}))?$/;

/** Parses a peso amount into integer cents. Rejects zero, negatives, and extra decimals. */
export function centsFromPesosInput(raw: string): number | null {
  const match = PESOS_INPUT.exec(raw.trim());
  if (!match) return null;
  const whole = Number(match[1]);
  const fraction = (match[2] ?? "").padEnd(2, "0");
  const cents = whole * 100 + Number(fraction);
  if (!Number.isSafeInteger(cents) || cents <= 0) return null;
  return cents;
}

export function formatPesosFromCents(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100);
  const fraction = String(abs % 100).padStart(2, "0");
  return `${sign}${whole}.${fraction}`;
}

/**
 * Tonkis credited for a declared consumption.
 * `round(pesos * percent / 100)` using integer cents so 9.975 becomes 10.
 */
export function tonkisFromAmountCents(cents: number, percent: number): number {
  if (!Number.isInteger(cents) || cents <= 0) return 0;
  if (!Number.isInteger(percent) || percent < 1 || percent > 100) return 0;
  return Math.round((cents * percent) / 10_000);
}

export function chargeExpiresAt(now = Date.now()): Date {
  return new Date(now + CHARGE_TTL_MS);
}

export function rewardTitleForEstablishment(name: string): string {
  const prefix = "Tonkis · ";
  return `${prefix}${name.trim()}`.slice(0, 150);
}

export function rewardDescriptionForCharge(
  percent: number,
  amountLabel: string
): string {
  return `Cashback ${percent}% sobre $${amountLabel} de referencia. No es un pago.`.slice(
    0,
    191
  );
}
