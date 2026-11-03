"use client";

import { formatMxn } from "src/lib/crm/formatMxn";
import type { CrmOverviewPayload, CrmProduct } from "src/lib/crm/types";

import { CrmAnalyticsCharts } from "./CrmAnalyticsCharts";
import { CrmRegisterSaleSection } from "./CrmRegisterSaleSection";

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-tonki-border border-l-4 border-l-tonki-accent bg-tonki-surface px-4 py-3 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-tonki-text-muted">
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-tonki-text">
        {value}
      </p>
      {hint ? (
        <p className="mt-0.5 text-xs text-tonki-text-faint">{hint}</p>
      ) : null}
    </div>
  );
}

type Props = {
  overview: CrmOverviewPayload;
  products: CrmProduct[];
  onSaleRegistered?: () => void;
};

export function CrmOverviewTab({
  overview,
  products,
  onSaleRegistered,
}: Props) {
  const { summary, series, establishment_name, cashback_percent, filter } =
    overview;
  const revenueLabel =
    filter.status === "credited"
      ? "Ingresos confirmados"
      : filter.status === "pending"
        ? "Ingresos pendientes"
        : "Ingresos";

  return (
    <div className="space-y-6 px-4 py-6">
      <div>
        <p className="text-sm text-tonki-text-muted">
          Negocio:{" "}
          <span className="font-semibold text-tonki-text">
            {establishment_name}
          </span>
        </p>
        <p className="mt-1 text-xs text-tonki-text-faint">
          Registra ventas por monto; el catálogo de productos es opcional.
        </p>
      </div>

      <CrmRegisterSaleSection
        cashbackPercent={cashback_percent}
        products={products}
        onRegistered={onSaleRegistered}
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <StatCard
          label={revenueLabel}
          value={formatMxn(summary.revenue)}
          hint={`${summary.sales_count.toLocaleString("es-MX")} ventas`}
        />
        <StatCard
          label="Ticket promedio"
          value={formatMxn(summary.average_ticket)}
        />
        <StatCard
          label="Ventas"
          value={summary.sales_count.toLocaleString("es-MX")}
        />
        <StatCard
          label="Productos activos"
          value={summary.active_products_count.toLocaleString("es-MX")}
          hint="En el catálogo"
        />
      </div>

      <CrmAnalyticsCharts series={series} />
    </div>
  );
}
