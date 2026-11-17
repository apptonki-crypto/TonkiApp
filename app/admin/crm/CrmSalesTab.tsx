"use client";

import { CHARGE_STATUS_CREDITED } from "src/lib/charges/constants";
import { formatMxn } from "src/lib/crm/formatMxn";
import { formatCrmRangeLabel } from "src/lib/crm/mexicoCity";
import { crmSaleStatusLabel, CRM_STATUS_FILTER_LABEL } from "src/lib/crm/saleStatus";
import type {
  CrmAnalyticsFilter,
  CrmProduct,
  CrmSale,
} from "src/lib/crm/types";
import { CRM_TIME_ZONE } from "src/lib/crm/types";

import { CrmRegisterSaleSection } from "./CrmRegisterSaleSection";

function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: CRM_TIME_ZONE,
  });
}

function emptyMessage(status: CrmAnalyticsFilter["status"]): string {
  if (status === "credited") return "No hay ventas confirmadas en este periodo.";
  if (status === "pending") return "No hay ventas pendientes en este periodo.";
  return "No hay ventas en este periodo.";
}

type Props = {
  sales: CrmSale[];
  salesCount: number;
  salesTruncated: boolean;
  filter: CrmAnalyticsFilter;
  cashbackPercent: number;
  products: CrmProduct[];
  onSaleRegistered?: () => void;
};

export function CrmSalesTab({
  sales,
  salesCount,
  salesTruncated,
  filter,
  cashbackPercent,
  products,
  onSaleRegistered,
}: Props) {
  return (
    <div className="space-y-6 px-4 py-6">
      <CrmRegisterSaleSection
        compact
        cashbackPercent={cashbackPercent}
        products={products}
        onRegistered={onSaleRegistered}
      />

      <section className="rounded-2xl border border-tonki-border bg-tonki-surface shadow-sm">
        <div className="border-b border-tonki-border px-4 py-3">
          <h2 className="text-sm font-semibold text-tonki-text-secondary">
            Historial de ventas
          </h2>
          <p className="mt-0.5 text-xs text-tonki-text-faint">
            {formatCrmRangeLabel(filter.from, filter.to)} ·{" "}
            {CRM_STATUS_FILTER_LABEL[filter.status]}
          </p>
        </div>
        {salesTruncated ? (
          <p className="border-b border-tonki-border px-4 py-3 text-sm text-tonki-text-muted">
            Se muestran {sales.length.toLocaleString("es-MX")} de{" "}
            {salesCount.toLocaleString("es-MX")} ventas. El CSV incluye el corte
            completo.
          </p>
        ) : null}
        {sales.length === 0 ? (
          <p className="px-4 py-6 text-sm text-tonki-text-muted">
            {emptyMessage(filter.status)}
          </p>
        ) : (
          <ul className="divide-y divide-tonki-border">
            {sales.map((sale) => (
              <li key={sale.charge_id} className="px-4 py-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-lg font-bold tabular-nums text-tonki-text">
                      {formatMxn(sale.amount)}
                    </p>
                    <p className="text-xs text-tonki-text-faint">
                      Registrada: {formatWhen(sale.created_at)}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      sale.status === CHARGE_STATUS_CREDITED
                        ? "bg-emerald-500/15 text-emerald-700"
                        : "bg-amber-500/15 text-amber-800"
                    }`}
                  >
                    {crmSaleStatusLabel(sale.status)}
                  </span>
                </div>

                {sale.claimed_by_name || sale.created_by_staff_name ? (
                  <p className="mt-2 text-sm text-tonki-text-secondary">
                    {sale.claimed_by_name ? `Cliente: ${sale.claimed_by_name}` : null}
                    {sale.claimed_by_name && sale.created_by_staff_name ? " · " : null}
                    {sale.created_by_staff_name
                      ? `Mesero: ${sale.created_by_staff_name}`
                      : null}
                  </p>
                ) : null}

                {sale.line_items.length > 0 ? (
                  <ul className="mt-3 space-y-1 rounded-xl border border-tonki-border bg-tonki-canvas px-3 py-2 text-sm">
                    {sale.line_items.map((line) => (
                      <li
                        key={line.line_item_id}
                        className="flex justify-between gap-2 text-tonki-text-secondary"
                      >
                        <span className="min-w-0 truncate">
                          {line.quantity}× {line.product_name}
                        </span>
                        <span className="shrink-0 tabular-nums">
                          {formatMxn(line.line_total)}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-xs text-tonki-text-faint">
                    Venta registrada solo por monto
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
