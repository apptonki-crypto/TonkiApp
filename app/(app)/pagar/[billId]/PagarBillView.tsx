"use client";

import { useEffect, useState } from "react";

import { scanMeseroBill } from "src/lib/mesero/fetchMeseroBillsClient";
import type { BillQrPayload } from "src/lib/mesero/types";

function formatMoney(value: number): string {
  return value.toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 2,
  });
}

export function PagarBillView({ billId }: { billId: string }) {
  const [bill, setBill] = useState<BillQrPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const result = await scanMeseroBill(billId);
      if (cancelled) return;

      if (!result.ok) {
        setError(result.error);
        setBill(null);
        setLoading(false);
        return;
      }

      setBill(result.bill);
      setError(null);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [billId]);

  if (loading) {
    return (
      <main className="mx-auto w-full px-4 py-14 text-center text-sm text-tonki-text-muted sm:px-6">
        Registrando escaneo…
      </main>
    );
  }

  if (error || !bill) {
    return (
      <main className="mx-auto w-full max-w-lg px-4 pb-8 pt-6 sm:px-6">
        <h1 className="text-2xl font-bold tracking-tight text-tonki-text">
          No se pudo cargar
        </h1>
        <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-tonki-danger">
          {error ?? "Cuenta no encontrada"}
        </p>
      </main>
    );
  }

  const scannedByYou = Boolean(bill.scanner_name);

  return (
    <main className="mx-auto w-full max-w-lg px-4 pb-8 pt-6 sm:px-6">
      <header>
        <p className="text-sm font-medium text-tonki-text-muted">Pago</p>
        <h1 className="text-2xl font-bold tracking-tight text-tonki-text">
          Cuenta lista
        </h1>
      </header>

      <section className="mt-8 rounded-2xl border border-tonki-border bg-tonki-surface p-5">
        <p className="text-sm font-medium text-tonki-text-muted">Total a pagar</p>
        <p className="mt-1 text-3xl font-bold tracking-tight text-tonki-text">
          {formatMoney(bill.total)}
        </p>

        <dl className="mt-5 space-y-3 text-sm">
          <div>
            <dt className="text-tonki-text-muted">Mesero</dt>
            <dd className="font-semibold text-tonki-text">{bill.creator_name}</dd>
          </div>
          <div>
            <dt className="text-tonki-text-muted">Escaneo</dt>
            <dd className="font-semibold text-tonki-text">
              {scannedByYou
                ? `Registrado como ${bill.scanner_name}`
                : "Sin escáner registrado (el creador del QR no se cuenta como escáner)."}
            </dd>
          </div>
          {bill.tonkis_awarded > 0 ? (
            <div>
              <dt className="text-tonki-text-muted">Cashback Tonkis</dt>
              <dd className="font-semibold text-tonki-accent">
                +{bill.tonkis_awarded.toLocaleString("es-MX")} Tonkis (1%)
              </dd>
            </div>
          ) : null}
        </dl>
      </section>

      <p className="mt-4 text-center text-xs text-tonki-text-muted">
        Vista de prueba — cashback del 1% en Tonkis; no se procesa un pago real.
      </p>
    </main>
  );
}
