"use client";

import type { CrmPeriodPreset, CrmStatusFilter } from "src/lib/crm/types";
import { CRM_STATUS_FILTER_LABEL } from "src/lib/crm/saleStatus";

const PERIODS: { id: CrmPeriodPreset; label: string }[] = [
  { id: "today", label: "Hoy" },
  { id: "7d", label: "7 días" },
  { id: "30d", label: "30 días" },
  { id: "month", label: "Este mes" },
  { id: "custom", label: "Personalizado" },
];

const STATUSES: CrmStatusFilter[] = ["credited", "pending", "all"];

const FIELD =
  "rounded-xl border border-tonki-border bg-tonki-canvas px-3 py-2 text-sm text-tonki-text outline-none transition-colors focus:border-tonki-accent";

type Props = {
  preset: CrmPeriodPreset;
  status: CrmStatusFilter;
  from: string;
  to: string;
  rangeLabel: string | null;
  refreshing: boolean;
  exportHref: string | null;
  exportFilename: string;
  onPresetChange: (preset: CrmPeriodPreset) => void;
  onStatusChange: (status: CrmStatusFilter) => void;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
};

function choiceClass(selected: boolean): string {
  return selected
    ? "rounded-full bg-tonki-accent px-3 py-1.5 text-sm font-semibold text-tonki-accent-fg"
    : "rounded-full border border-tonki-border px-3 py-1.5 text-sm font-semibold text-tonki-text-secondary transition-colors hover:bg-tonki-surface-hover";
}

export function CrmAnalyticsFilters({
  preset,
  status,
  from,
  to,
  rangeLabel,
  refreshing,
  exportHref,
  exportFilename,
  onPresetChange,
  onStatusChange,
  onFromChange,
  onToChange,
}: Props) {
  const customError =
    preset === "custom" && from && to && from > to
      ? "La fecha inicial no puede ser posterior a la final"
      : preset === "custom" && (!from || !to)
        ? "Indica la fecha inicial y final"
        : null;

  return (
    <section className="rounded-2xl border border-tonki-border bg-tonki-surface p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-tonki-text-muted">
            Periodo
          </p>
          <div role="group" aria-label="Periodo" className="mt-2 flex flex-wrap gap-2">
            {PERIODS.map((period) => (
              <button
                key={period.id}
                type="button"
                aria-pressed={preset === period.id}
                onClick={() => onPresetChange(period.id)}
                className={choiceClass(preset === period.id)}
              >
                {period.label}
              </button>
            ))}
          </div>
        </div>
        {exportHref ? (
          <a
            href={exportHref}
            download={exportFilename}
            className="inline-flex shrink-0 items-center justify-center rounded-xl bg-tonki-accent px-4 py-2 text-sm font-bold text-tonki-accent-fg transition-colors hover:bg-tonki-accent-hover"
          >
            Descargar CSV
          </a>
        ) : (
          <span
            aria-disabled="true"
            className="inline-flex shrink-0 cursor-not-allowed items-center justify-center rounded-xl bg-tonki-accent px-4 py-2 text-sm font-bold text-tonki-accent-fg opacity-50"
          >
            Descargar CSV
          </span>
        )}
      </div>

      {preset === "custom" ? (
        <div className="mt-3 flex flex-wrap gap-3">
          <label className="text-sm text-tonki-text-secondary" htmlFor="crm-from">
            Desde
            <input
              id="crm-from"
              type="date"
              value={from}
              onChange={(event) => onFromChange(event.target.value)}
              className={`${FIELD} mt-1 block`}
            />
          </label>
          <label className="text-sm text-tonki-text-secondary" htmlFor="crm-to">
            Hasta
            <input
              id="crm-to"
              type="date"
              value={to}
              onChange={(event) => onToChange(event.target.value)}
              className={`${FIELD} mt-1 block`}
            />
          </label>
        </div>
      ) : null}

      <div className="mt-4">
        <p className="text-xs font-medium uppercase tracking-wide text-tonki-text-muted">
          Estado
        </p>
        <div role="group" aria-label="Estado" className="mt-2 flex flex-wrap gap-2">
          {STATUSES.map((id) => (
            <button
              key={id}
              type="button"
              aria-pressed={status === id}
              onClick={() => onStatusChange(id)}
              className={choiceClass(status === id)}
            >
              {CRM_STATUS_FILTER_LABEL[id]}
            </button>
          ))}
        </div>
      </div>

      <p className="mt-3 text-xs text-tonki-text-faint">
        {refreshing ? "Actualizando… " : null}
        {rangeLabel ? <span>{rangeLabel}. </span> : null}
        La hora de la venta es el registro del código, en Ciudad de México.
        {status === "credited"
          ? " Las ventas nuevas quedan pendientes hasta que el cliente confirma."
          : null}
      </p>
      {customError ? (
        <p role="alert" className="mt-2 text-sm text-tonki-danger">
          {customError}
        </p>
      ) : null}
    </section>
  );
}
