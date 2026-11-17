"use client";

import { useCallback, useEffect, useState } from "react";

import { SaleRegisterForm } from "src/components/admin/SaleRegisterForm";
import type { CrmProduct } from "src/lib/crm/types";
import {
  fetchStaffContext,
  fetchStaffShiftCharges,
  type StaffShiftChargeWithQr,
} from "src/lib/staff/fetchStaffClient";
import type { StaffContext } from "src/lib/staff/types";

const FIELD =
  "w-full rounded-xl border border-tonki-border bg-tonki-surface px-4 py-3 text-tonki-text outline-none transition-colors focus:border-tonki-accent";

const STATUS_LABEL: Record<StaffShiftChargeWithQr["status"], string> = {
  pending: "Esperando pago",
  credited: "Pagado",
  expired: "Vencido",
};

const STATUS_CLASS: Record<StaffShiftChargeWithQr["status"], string> = {
  pending: "bg-tonki-accent/15 text-tonki-accent",
  credited: "bg-emerald-500/15 text-emerald-700",
  expired: "bg-tonki-elevated text-tonki-text-muted",
};

/** Cada cuánto se refresca la lista para ver los pagos confirmados. */
const POLL_MS = 15_000;

function formatMoney(amount: string): string {
  const value = Number(amount);
  if (!Number.isFinite(value)) return amount;
  return value.toLocaleString("es-MX", { style: "currency", currency: "MXN" });
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
}

export default function MeseroPage() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [context, setContext] = useState<StaffContext | null>(null);
  const [catalog, setCatalog] = useState<CrmProduct[]>([]);
  const [charges, setCharges] = useState<StaffShiftChargeWithQr[]>([]);
  const [chargesError, setChargesError] = useState<string | null>(null);
  const [openToken, setOpenToken] = useState<string | null>(null);

  const loadCharges = useCallback(async () => {
    const result = await fetchStaffShiftCharges();
    if (result.ok) {
      setCharges(result.data);
      setChargesError(null);
    } else {
      setChargesError(result.error);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await fetchStaffContext();
      if (cancelled) return;
      if (!result.ok) {
        setLoadError(result.error);
      } else {
        setContext(result.data.context);
        setCatalog(result.data.products);
        await loadCharges();
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [loadCharges]);

  useEffect(() => {
    if (!context) return;
    const id = window.setInterval(() => void loadCharges(), POLL_MS);
    return () => window.clearInterval(id);
  }, [context, loadCharges]);

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-bold tracking-tight text-tonki-text">Cobrar</h1>
      <p className="mt-2 text-sm text-tonki-text-muted">
        Escribe el consumo y muestra el QR al cliente. El pago llega directo al negocio.
      </p>

      {loading ? (
        <p className="mt-8 text-sm text-tonki-text-muted">Cargando…</p>
      ) : loadError || !context ? (
        <p
          role="alert"
          className="mt-8 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-tonki-danger"
        >
          {loadError ?? "No se pudo cargar el negocio"}
        </p>
      ) : (
        <>
          <section className="mt-6 space-y-6 rounded-2xl border border-tonki-border bg-tonki-surface p-6 shadow-sm">
            <p className="text-sm text-tonki-text-secondary">
              <span className="font-semibold text-tonki-text">{context.establishment_name}</span>
              {" · "}
              {context.cashback_percent}% en Tonkis
            </p>
            <SaleRegisterForm
              endpoint="/api/staff/charges"
              cashbackPercent={context.cashback_percent}
              products={catalog}
              onRegistered={() => void loadCharges()}
              amountModeLabel="Monto libre"
              productsModeLabel="Por productos"
              amountFieldId="staff-charge-amount"
              amountFieldLabel="Monto del consumo (pesos)"
              submitLabel="Generar QR"
              errorFallback="No se pudo generar el código"
              fieldClassName={FIELD}
              result="detailed"
              emptyCatalog={
                <p className="text-sm text-tonki-text-secondary">
                  El negocio no tiene productos. Usa{" "}
                  <strong className="font-semibold text-tonki-text">Monto libre</strong>.
                </p>
              }
            />
          </section>

          <section className="mt-8">
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="text-lg font-bold text-tonki-text">Tus QR de hoy</h2>
              <button
                type="button"
                onClick={() => void loadCharges()}
                className="text-sm font-semibold text-tonki-accent"
              >
                Actualizar
              </button>
            </div>
            {chargesError ? (
              <p role="alert" className="mt-3 text-sm text-tonki-danger">
                {chargesError}
              </p>
            ) : null}
            {charges.length === 0 ? (
              <p className="mt-3 text-sm text-tonki-text-muted">
                Aún no generas códigos en este turno.
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-tonki-border rounded-2xl border border-tonki-border bg-tonki-surface">
                {charges.map((charge) => {
                  const open = openToken === charge.token && charge.qr_image;
                  return (
                    <li key={charge.token} className="px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-semibold text-tonki-text">
                            {formatMoney(charge.amount)}
                          </p>
                          <p className="text-xs text-tonki-text-muted">
                            {formatTime(charge.created_at)} ·{" "}
                            {charge.points.toLocaleString("es-MX")} Tonkis
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span
                            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_CLASS[charge.status]}`}
                          >
                            {STATUS_LABEL[charge.status]}
                          </span>
                          {charge.qr_image ? (
                            <button
                              type="button"
                              onClick={() =>
                                setOpenToken(open ? null : charge.token)
                              }
                              className="text-sm font-semibold text-tonki-accent"
                            >
                              {open ? "Ocultar" : "Ver QR"}
                            </button>
                          ) : null}
                        </div>
                      </div>
                      {open ? (
                        <div className="mt-3 flex justify-center">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={charge.qr_image!}
                            alt="QR para cobrar"
                            width={240}
                            height={240}
                            className="h-60 w-60 rounded-xl"
                          />
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      )}
    </main>
  );
}
