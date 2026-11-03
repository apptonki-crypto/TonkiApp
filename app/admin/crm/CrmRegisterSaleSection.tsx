"use client";

import { SaleRegisterForm } from "src/components/admin/SaleRegisterForm";
import type { CrmProduct } from "src/lib/crm/types";

const FIELD =
  "w-full rounded-xl border border-tonki-border bg-tonki-canvas px-4 py-3 text-tonki-text outline-none transition-colors focus:border-tonki-accent";

type Props = {
  cashbackPercent: number;
  products: CrmProduct[];
  onRegistered?: () => void;
  compact?: boolean;
};

export function CrmRegisterSaleSection({
  cashbackPercent,
  products,
  onRegistered,
  compact = false,
}: Props) {
  return (
    <section className="rounded-2xl border border-tonki-border bg-tonki-surface p-5 shadow-sm">
      <h2 className="text-base font-semibold text-tonki-text">
        {compact ? "Nueva venta" : "Registrar venta"}
      </h2>
      <p className="mt-1 text-sm text-tonki-text-muted">
        Indica el monto en pesos; los productos son opcionales para desglosar.
      </p>
      <div className="mt-4">
        <SaleRegisterForm
          cashbackPercent={cashbackPercent}
          products={products}
          onRegistered={onRegistered}
          amountModeLabel="Por monto"
          productsModeLabel="Por productos"
          amountFieldId={compact ? "crm-sale-amount-compact" : "crm-sale-amount"}
          amountFieldLabel="Monto (MXN)"
          submitLabel="Generar código de venta"
          errorFallback="No se pudo registrar la venta"
          fieldClassName={FIELD}
          result="compact"
        />
      </div>
    </section>
  );
}
