export const WEEKDAY_KEYS = [
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
  "sun",
] as const;

export type WeekdayKey = (typeof WEEKDAY_KEYS)[number];

export type DayHours = {
  closed: boolean;
  open: string;
  close: string;
};

export type WeekHours = Record<WeekdayKey, DayHours>;

const DAY_LABEL: Record<WeekdayKey, string> = {
  mon: "Lunes",
  tue: "Martes",
  wed: "Miércoles",
  thu: "Jueves",
  fri: "Viernes",
  sat: "Sábado",
  sun: "Domingo",
};

const DAY_SHORT: Record<WeekdayKey, string> = {
  mon: "Lun",
  tue: "Mar",
  wed: "Mié",
  thu: "Jue",
  fri: "Vie",
  sat: "Sáb",
  sun: "Dom",
};

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export const DEFAULT_OPEN = "09:00";
export const DEFAULT_CLOSE = "18:00";

function closedDay(): DayHours {
  return { closed: true, open: DEFAULT_OPEN, close: DEFAULT_CLOSE };
}

export function emptyWeekHours(): WeekHours {
  return {
    mon: closedDay(),
    tue: closedDay(),
    wed: closedDay(),
    thu: closedDay(),
    fri: closedDay(),
    sat: closedDay(),
    sun: closedDay(),
  };
}

function isDayHours(value: unknown): value is {
  closed?: boolean;
  open?: string;
  close?: string;
} {
  return typeof value === "object" && value !== null;
}

export function parseWeekHours(raw: string | null | undefined): WeekHours {
  const week = emptyWeekHours();
  if (!raw?.trim()) return week;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return week;
  }
  if (typeof parsed !== "object" || parsed === null) return week;
  const record = parsed as Record<string, unknown>;
  for (const key of WEEKDAY_KEYS) {
    const day = record[key];
    if (!isDayHours(day)) continue;
    const closed = day.closed !== false;
    const open = typeof day.open === "string" && TIME_PATTERN.test(day.open)
      ? day.open
      : DEFAULT_OPEN;
    const close =
      typeof day.close === "string" && TIME_PATTERN.test(day.close)
        ? day.close
        : DEFAULT_CLOSE;
    week[key] = { closed, open, close };
  }
  return week;
}

export function serializeWeekHours(week: WeekHours): string {
  const payload: Record<string, { closed: boolean; open?: string; close?: string }> =
    {};
  for (const key of WEEKDAY_KEYS) {
    const day = week[key];
    payload[key] = day.closed
      ? { closed: true }
      : { closed: false, open: day.open, close: day.close };
  }
  return JSON.stringify(payload);
}

function rangeLabel(start: WeekdayKey, end: WeekdayKey): string {
  if (start === end) return DAY_SHORT[start];
  return `${DAY_SHORT[start]}–${DAY_SHORT[end]}`;
}

export function formatWeekHours(week: WeekHours): string {
  const lines: string[] = [];
  let index = 0;
  while (index < WEEKDAY_KEYS.length) {
    const key = WEEKDAY_KEYS[index]!;
    const day = week[key];
    const signature = day.closed ? "cerrado" : `${day.open}–${day.close}`;
    let end = index;
    while (end + 1 < WEEKDAY_KEYS.length) {
      const nextKey = WEEKDAY_KEYS[end + 1]!;
      const next = week[nextKey];
      const nextSignature = next.closed
        ? "cerrado"
        : `${next.open}–${next.close}`;
      if (nextSignature !== signature) break;
      end += 1;
    }
    const label = rangeLabel(key, WEEKDAY_KEYS[end]!);
    lines.push(
      signature === "cerrado" ? `${label} cerrado` : `${label} ${signature}`
    );
    index = end + 1;
  }
  return lines.join("\n");
}

export function formatStoredHours(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim() ?? "";
  if (!trimmed) return null;
  if (!trimmed.startsWith("{")) return trimmed;
  return formatWeekHours(parseWeekHours(trimmed));
}

/** True si hay texto libre o al menos un día abierto en el horario guardado. */
export function hasOpenHours(raw: string | null | undefined): boolean {
  const trimmed = raw?.trim() ?? "";
  if (!trimmed) return false;
  if (!trimmed.startsWith("{")) return true;
  const week = parseWeekHours(trimmed);
  return WEEKDAY_KEYS.some((key) => !week[key].closed);
}

export function weekdayLabel(key: WeekdayKey): string {
  return DAY_LABEL[key];
}
