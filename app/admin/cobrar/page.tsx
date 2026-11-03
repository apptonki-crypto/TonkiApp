"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { SaleRegisterForm } from "src/components/admin/SaleRegisterForm";
import { readJsonSafely } from "src/lib/api/readJsonSafely";
import { fetchCrmProducts } from "src/lib/crm/fetchCrmClient";
import type { CrmProduct } from "src/lib/crm/types";
import type { EstablishmentProfile } from "src/lib/establishment/types";

type EstablishmentResponse =
  | { success: true; establishment: EstablishmentProfile | null }
  | { success: false; error?: string };

const FIELD =
  "w-full rounded-xl border border-tonki-border bg-tonki-surface px-4 py-3 text-tonki-text outline-none transition-colors focus:border-tonki-accent";

export default function CobrarPage() {
  const [loading, setLoading] = useState(true);
  const [establishment, setEstablishment] = useState<EstablishmentProfile | null>(
    null
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<CrmProduct[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/establishment", { credentials: "include" });
        const data = await readJsonSafely<EstablishmentResponse>(res);
        if (cancelled) return;
        if (!res.ok || !data?.success) {
          setLoadError(
            data && "error" in data && data.error
              ? data.error
              : "No se pudo cargar el negocio"
          );
          return;
        }
        setEstablishment(data.establishment);
        if (data.establishment) {
          const productsResult = await fetchCrmProducts({
            networkErrorMessage: "No se pudieron cargar productos",
          });
          if (!cancelled && productsResult.ok) {
            setCatalog(productsResult.products);
          }
        }
      } catch {
        if (!cancelled) setLoadError("No se pudo cargar el negocio");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="mx-auto w-full px-4 py-8 sm:px-6 sm:py-10">
      <h1 className="text-2xl font-bold tracking-tight text-tonki-text sm:text-3xl">
        QR de consumo
      </h1>
      <p className="mt-2 max-w-xl text-sm text-tonki-text-muted sm:text-base">
        Declara el monto del consumo. No se cobra ni se mueve dinero: el cliente
        recibe Tonkis al confirmar el código.
      </p>

      {loading ? (
        <p className="mt-8 text-sm text-tonki-text-muted">Cargando negocio…</p>
      ) : loadError ? (
        <p
          role="alert"
          className="mt-8 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-tonki-danger"
        >
          {loadError}
        </p>
      ) : !establishment ? (
        <section className="mt-8 space-y-4 rounded-2xl border border-tonki-border bg-tonki-surface p-6 shadow-sm">
          <p className="text-sm text-tonki-text-secondary">
            Primero registra tu negocio para congelar el porcentaje de Tonkis.
          </p>
          <Link
            href="/account"
            className="inline-flex rounded-xl bg-tonki-accent px-4 py-3 text-sm font-bold text-tonki-accent-fg transition-colors hover:bg-tonki-accent-hover"
          >
            Ir a tu negocio
          </Link>
        </section>
      ) : (
        <section className="mt-8 space-y-6 rounded-2xl border border-tonki-border bg-tonki-surface p-6 shadow-sm sm:p-8">
          <p className="text-sm text-tonki-text-secondary">
            <span className="font-semibold text-tonki-text">
              {establishment.name}
            </span>
            {" · "}
            {establishment.cashback_percent}% en Tonkis
          </p>

          <SaleRegisterForm
            cashbackPercent={establishment.cashback_percent}
            products={catalog}
            amountModeLabel="Monto libre"
            productsModeLabel="Por productos"
            amountFieldId="charge-amount"
            amountFieldLabel="Monto del consumo (pesos)"
            amountHint="Solo referencia. Este monto no se cobra."
            submitLabel="Generar código"
            errorFallback="No se pudo generar el código"
            fieldClassName={FIELD}
            result="detailed"
            allowEmptyProductMode
            emptyCatalog={
              <p className="text-sm text-tonki-text-secondary">
                No tienes productos en el catálogo. Usa{" "}
                <strong className="font-semibold text-tonki-text">Monto libre</strong>{" "}
                o créalos en{" "}
                <Link href="/admin/crm" className="font-semibold text-tonki-accent">
                  CRM · ventas
                </Link>
                .
              </p>
            }
          />
        </section>
      )}
    </main>
  );
}
