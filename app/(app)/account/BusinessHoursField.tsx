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
  "rounded-xl border border-tonki-border bg-tonki-surface px-3 py-2 text-sm text-tonki-text outline-none focus:border-tonki-accent disabled:opacity-40";

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
    <fieldset className="space-y-3 rounded-xl border border-tonki-border p-4">
      <legend className="px-1 text-sm font-medium text-tonki-text">
        Horario
      </legend>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-tonki-text-faint">
          Marca cada día como cerrado o elige la hora de apertura y cierre.
        </p>
        <button
          type="button"
          onClick={copyMonday}
          className="rounded-lg border border-tonki-border px-3 py-1.5 text-xs font-semibold text-tonki-accent hover:bg-tonki-elevated"
        >
          Copiar lunes a todos
        </button>
      </div>
      <ul className="space-y-2">
        {WEEKDAY_KEYS.map((key) => {
          const day = week[key];
          return (
            <li
              key={key}
              className="grid grid-cols-1 items-center gap-2 rounded-xl bg-tonki-canvas px-3 py-2 sm:grid-cols-[7.5rem_auto_1fr]"
            >
              <span className="text-sm font-semibold text-tonki-text">
                {weekdayLabel(key)}
              </span>
              <label className="flex items-center gap-2 text-sm text-tonki-text-secondary">
                <input
                  type="checkbox"
                  checked={day.closed}
                  onChange={(event) =>
                    setDay(key, {
                      closed: event.target.checked,
                      open: day.open || DEFAULT_OPEN,
                      close: day.close || DEFAULT_CLOSE,
                    })
                  }
                />
                Cerrado
              </label>
              <div className="flex flex-wrap items-center gap-2">
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
