import type { CrmHourPoint } from "src/lib/crm/types";

function moneyCents(value: string): number {
  const trimmed = value.trim();
  const negative = trimmed.startsWith("-");
  const [wholeRaw, fracRaw = ""] = trimmed.replace(/^-/, "").split(".");
  const whole = Number(wholeRaw);
  const frac = Number(fracRaw.padEnd(2, "0").slice(0, 2));
  if (!Number.isFinite(whole) || !Number.isFinite(frac)) return 0;
  const cents = whole * 100 + frac;
  return negative ? -cents : cents;
}

/** Hours tied for the most sales. Empty when the day has no sales. */
export function peakSaleHours(hours: readonly CrmHourPoint[]): CrmHourPoint[] {
  const best = hours.reduce((max, point) => Math.max(max, point.sales_count), 0);
  if (best <= 0) return [];
  return hours.filter((point) => point.sales_count === best);
}

/** Hour with the highest revenue. Null when every hour is $0. */
export function peakRevenueHour(hours: readonly CrmHourPoint[]): CrmHourPoint | null {
  let best: CrmHourPoint | null = null;
  let bestCents = 0;
  for (const point of hours) {
    const cents = moneyCents(point.revenue);
    if (cents > bestCents) {
      best = point;
      bestCents = cents;
    }
  }
  return best;
}
