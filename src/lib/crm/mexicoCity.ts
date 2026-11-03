import {
  CRM_TIME_ZONE,
  type CrmPeriodPreset,
} from "src/lib/crm/types";

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MAX_RANGE_DAYS = 366;

const WEEKDAY_INDEX: Record<string, number> = {
  Mon: 0,
  Tue: 1,
  Wed: 2,
  Thu: 3,
  Fri: 4,
  Sat: 5,
  Sun: 6,
};

export const CRM_WEEKDAY_SHORT = [
  "lun",
  "mar",
  "mié",
  "jue",
  "vie",
  "sáb",
  "dom",
] as const;

export const CRM_WEEKDAY_FULL = [
  "lunes",
  "martes",
  "miércoles",
  "jueves",
  "viernes",
  "sábado",
  "domingo",
] as const;

const MONTHS_SHORT = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic",
] as const;

const FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: CRM_TIME_ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  weekday: "short",
});

export type MexicoCityStamp = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  dateKey: string;
  time: string;
  weekdayIndex: number;
  weekdayShort: (typeof CRM_WEEKDAY_SHORT)[number];
  weekdayFull: (typeof CRM_WEEKDAY_FULL)[number];
};

export type CrmResolvedRange = {
  fromDate: string;
  toDate: string;
  from: Date;
  to: Date;
};

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function isRealIsoDate(value: string): boolean {
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utc = new Date(Date.UTC(year, month - 1, day));
  return (
    utc.getUTCFullYear() === year &&
    utc.getUTCMonth() === month - 1 &&
    utc.getUTCDate() === day
  );
}

export function mexicoCityStamp(date: Date): MexicoCityStamp {
  const map: Record<string, string> = {};
  for (const part of FORMATTER.formatToParts(date)) {
    if (part.type !== "literal") map[part.type] = part.value;
  }

  let hour = Number(map.hour);
  if (hour === 24) hour = 0;

  const year = Number(map.year);
  const month = Number(map.month);
  const day = Number(map.day);
  const minute = Number(map.minute);
  const second = Number(map.second);
  const weekdayToken = (map.weekday ?? "").replace(/[^A-Za-z]/g, "").slice(0, 3);
  const weekdayIndex = WEEKDAY_INDEX[weekdayToken] ?? 0;

  return {
    year,
    month,
    day,
    hour,
    minute,
    second,
    dateKey: `${year}-${pad(month)}-${pad(day)}`,
    time: `${pad(hour)}:${pad(minute)}`,
    weekdayIndex,
    weekdayShort: CRM_WEEKDAY_SHORT[weekdayIndex] ?? "lun",
    weekdayFull: CRM_WEEKDAY_FULL[weekdayIndex] ?? "lunes",
  };
}

export function addCalendarDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day + days));
  return `${utc.getUTCFullYear()}-${pad(utc.getUTCMonth() + 1)}-${pad(utc.getUTCDate())}`;
}

export function eachDateKey(fromDate: string, toDate: string): string[] {
  const dates: string[] = [];
  let cursor = fromDate;
  while (cursor <= toDate && dates.length <= MAX_RANGE_DAYS) {
    dates.push(cursor);
    cursor = addCalendarDays(cursor, 1);
  }
  return dates;
}

/** Monday = 0 … Sunday = 6, from a `YYYY-MM-DD` calendar date. */
export function weekdayIndexForDateKey(dateKey: string): number {
  const [year, month, day] = dateKey.split("-").map(Number);
  const jsDay = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return jsDay === 0 ? 6 : jsDay - 1;
}

export function formatCrmDayTick(isoDate: string): string {
  const [, month, day] = isoDate.split("-");
  const monthLabel = MONTHS_SHORT[Number(month) - 1] ?? month;
  return `${Number(day)} ${monthLabel}`;
}

export function formatCrmDateLabel(isoDate: string): string {
  const [year, month, day] = isoDate.split("-");
  const monthLabel = MONTHS_SHORT[Number(month) - 1] ?? month;
  return `${Number(day)} ${monthLabel} ${year}`;
}

export function formatCrmRangeLabel(from: string, to: string): string {
  if (from === to) return formatCrmDateLabel(from);
  return `${formatCrmDateLabel(from)} – ${formatCrmDateLabel(to)}`;
}

function inclusiveDayCount(fromDate: string, toDate: string): number {
  const [y1, m1, d1] = fromDate.split("-").map(Number);
  const [y2, m2, d2] = toDate.split("-").map(Number);
  const ms = Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1);
  return Math.round(ms / 86_400_000) + 1;
}

/** Wall-clock time in America/Mexico_City → UTC instant. */
export function zonedDateTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0
): Date {
  const wallAsUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  let utc = wallAsUtc;
  for (let pass = 0; pass < 3; pass += 1) {
    const stamp = mexicoCityStamp(new Date(utc));
    const stampedAsUtc = Date.UTC(
      stamp.year,
      stamp.month - 1,
      stamp.day,
      stamp.hour,
      stamp.minute,
      stamp.second
    );
    const next = wallAsUtc - (stampedAsUtc - utc);
    if (next === utc) break;
    utc = next;
  }
  return new Date(utc);
}

function startOfMexicoDay(isoDate: string): Date {
  const [year, month, day] = isoDate.split("-").map(Number);
  return zonedDateTimeToUtc(year, month, day, 0, 0, 0);
}

export function resolveCrmRange(input: {
  preset: CrmPeriodPreset;
  from?: string | null;
  to?: string | null;
  now?: Date;
}): { ok: true; range: CrmResolvedRange } | { ok: false; error: string } {
  const today = mexicoCityStamp(input.now ?? new Date()).dateKey;
  let fromDate: string;
  let toDate: string;

  if (input.preset === "custom") {
    if (!input.from || !input.to) {
      return { ok: false, error: "Indica la fecha inicial y final" };
    }
    if (!isRealIsoDate(input.from) || !isRealIsoDate(input.to)) {
      return { ok: false, error: "Fecha no válida" };
    }
    fromDate = input.from;
    toDate = input.to;
  } else if (input.preset === "today") {
    fromDate = today;
    toDate = today;
  } else if (input.preset === "7d") {
    fromDate = addCalendarDays(today, -6);
    toDate = today;
  } else if (input.preset === "30d") {
    fromDate = addCalendarDays(today, -29);
    toDate = today;
  } else {
    fromDate = `${today.slice(0, 8)}01`;
    toDate = today;
  }

  if (fromDate > toDate) {
    return {
      ok: false,
      error: "La fecha inicial no puede ser posterior a la final",
    };
  }

  if (inclusiveDayCount(fromDate, toDate) > MAX_RANGE_DAYS) {
    return { ok: false, error: "El periodo no puede ser mayor a 366 días" };
  }

  const dayAfter = addCalendarDays(toDate, 1);
  return {
    ok: true,
    range: {
      fromDate,
      toDate,
      from: startOfMexicoDay(fromDate),
      to: startOfMexicoDay(dayAfter),
    },
  };
}
