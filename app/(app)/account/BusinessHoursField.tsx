"use client";

import {
  DEFAULT_CLOSE,
  DEFAULT_OPEN,
  parseWeekHours,
  serializeWeekHours,
  weekdayLabel,
  WEEKDAY_KEYS,
  type WeekHours,
} from "src/lib/establishment/hours";

const TIME =
  "h-10 w-full min-w-0 rounded-lg border border-tonki-border bg-white px-2.5 text-sm tabular-nums text-tonki-text outline-none transition focus:border-tonki-accent focus:ring-4 focus:ring-tonki-accent/25 sm:w-28";

type Props = {
  value: string;
  onChange: (value: string) => void;
};

export function BusinessHoursField({ value, onChange }: Props) {
  const week = parseWeekHours(value);

  function update(next: WeekHours) {
    onChange(serializeWeekHours(next));
  }

  function setDay(
    key: (typeof WEEKDAY_KEYS)[number],
    patch: Partial<WeekHours[(typeof WEEKDAY_KEYS)[number]]>
  ) {
    update({ ...week, [key]: { ...week[key], ...patch } });
  }

  function copyMonday() {
    const monday = week.mon;
    const next = { ...week };
    for (const key of WEEKDAY_KEYS) {
      next[key] = { ...monday };
    }
    update(next);
  }

  return (
    <fieldset className="space-y-3">
      <legend className="sr-only">Horario</legend>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-tonki-text-faint">
          Activa los días que abres y ajusta la hora de apertura y cierre.
        </p>
        <button
          type="button"
          onClick={copyMonday}
          className="rounded-full border border-tonki-border-strong bg-white/60 px-3 py-1.5 text-xs font-semibold text-tonki-text transition hover:border-tonki-accent hover:bg-tonki-accent/20"
        >
          Copiar lunes a todos
        </button>
      </div>
      <ul className="overflow-hidden rounded-2xl border border-tonki-border bg-white/50">
        {WEEKDAY_KEYS.map((key) => {
          const day = week[key];
          const open = !day.closed;
          return (
            <li
              key={key}
              className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-2 border-b border-tonki-border/70 px-4 py-3 last:border-b-0 sm:grid-cols-[8rem_7.5rem_1fr]"
            >
              <span className="text-sm font-semibold text-tonki-text">
                {weekdayLabel(key)}
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={open}
                aria-label={`${weekdayLabel(key)} abierto`}
                onClick={() =>
                  setDay(key, {
                    closed: open,
                    open: day.open || DEFAULT_OPEN,
                    close: day.close || DEFAULT_CLOSE,
                  })
                }
                className="group flex items-center gap-2 justify-self-end sm:justify-self-start"
              >
                <span
                  className={`relative h-6 w-11 rounded-full transition-colors ${
                    open ? "bg-tonki-accent" : "bg-tonki-border-strong/70"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                      open ? "translate-x-[22px]" : "translate-x-0.5"
                    }`}
                  />
                </span>
                <span
                  className={`w-14 text-left text-xs font-semibold ${
                    open ? "text-tonki-text" : "text-tonki-text-faint"
                  }`}
                >
                  {open ? "Abierto" : "Cerrado"}
                </span>
              </button>
              <div
                className={`col-span-2 flex items-center gap-2 transition-opacity sm:col-span-1 ${
                  open ? "" : "pointer-events-none opacity-35"
                }`}
              >
                <input
                  aria-label={`Apertura ${weekdayLabel(key)}`}
                  type="time"
                  value={day.open}
                  disabled={day.closed}
                  onChange={(event) => {
                    if (!/^\d{2}:\d{2}$/.test(event.target.value)) return;
                    setDay(key, { open: event.target.value });
                  }}
                  className={TIME}
                />
                <span className="text-xs text-tonki-text-faint">a</span>
                <input
                  aria-label={`Cierre ${weekdayLabel(key)}`}
                  type="time"
                  value={day.close}
                  disabled={day.closed}
                  onChange={(event) => {
                    if (!/^\d{2}:\d{2}$/.test(event.target.value)) return;
                    setDay(key, { close: event.target.value });
                  }}
                  className={TIME}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}
