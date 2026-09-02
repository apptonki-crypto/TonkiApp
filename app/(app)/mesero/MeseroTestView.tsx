"use client";

import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
} from "react";
import { QRCodeSVG } from "qrcode.react";

import {
  createMeseroBill,
  fetchMeseroBill,
} from "src/lib/mesero/fetchMeseroBillsClient";
import type { BillQrPayload } from "src/lib/mesero/types";

const FIELD =
  "w-full rounded-xl border border-tonki-border bg-tonki-surface px-3 py-2.5 text-sm text-tonki-text outline-none transition-colors focus:border-tonki-accent";

const POLL_MS = 3000;

function formatMoney(value: number): string {
  return value.toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 2,
  });
}

export function MeseroTestView() {
  const [amountInput, setAmountInput] = useState("");
  const [bill, setBill] = useState<BillQrPayload | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setError(null);

      const total = Number(amountInput.replace(",", "."));
      if (!Number.isFinite(total) || total <= 0) {
        setError("Ingresa un monto válido mayor a 0");
        return;
      }

      setCreating(true);
      const result = await createMeseroBill({ total_amount: total });
      setCreating(false);

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setBill(result.bill);
    },
    [amountInput]
  );

  const handleReset = useCallback(() => {
    setBill(null);
    setAmountInput("");
    setError(null);
  }, []);

  useEffect(() => {
    if (!bill?.bill_id || bill.scanner_name) return;

    let cancelled = false;
    const tick = async () => {
      const result = await fetchMeseroBill(bill.bill_id);
      if (cancelled || !result.ok) return;
      setBill(result.bill);
    };

    const id = window.setInterval(() => {
      void tick();
    }, POLL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [bill?.bill_id, bill?.scanner_name]);

  return (
    <main className="mx-auto w-full max-w-lg px-4 pb-8 pt-6 sm:px-6">
      <header>
        <p className="text-sm font-medium text-tonki-text-muted">Prueba</p>
        <h1 className="text-2xl font-bold tracking-tight text-tonki-text">
          Vista mesero
        </h1>
        <p className="mt-1 text-sm text-tonki-text-secondary">
          Ingresa el total de la cuenta y genera un QR para que el cliente
          escanee.
        </p>
      </header>

      {!bill ? (
        <form onSubmit={handleCreate} className="mt-8 space-y-4">
          <div>
            <label
              htmlFor="mesero-total"
              className="mb-1 block text-sm font-medium text-tonki-text"
            >
              Monto total (MXN)
            </label>
            <input
              id="mesero-total"
              type="number"
              inputMode="decimal"
              min="0.01"
              step="0.01"
              max="1000000"
              required
              value={amountInput}
              onChange={(e) => setAmountInput(e.target.value)}
              className={FIELD}
              placeholder="250.00"
            />
          </div>

          {error ? (
            <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-tonki-danger">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={creating}
            className="w-full rounded-xl bg-tonki-accent py-3 text-sm font-bold text-tonki-accent-fg transition-colors hover:bg-tonki-accent-hover disabled:opacity-60"
          >
            {creating ? "Generando…" : "Generar QR"}
          </button>
        </form>
      ) : (
        <section className="mt-8 space-y-5">
          <div className="rounded-2xl border border-tonki-border bg-tonki-surface p-5 text-center">
            <p className="text-sm font-medium text-tonki-text-muted">Total</p>
            <p className="mt-1 text-3xl font-bold tracking-tight text-tonki-text">
              {formatMoney(bill.total)}
            </p>
            <p className="mt-2 text-sm text-tonki-text-secondary">
              Creado por{" "}
              <span className="font-semibold text-tonki-text">
                {bill.creator_name}
              </span>
            </p>

            <div className="mx-auto mt-5 flex w-fit items-center justify-center rounded-2xl bg-white p-4">
              <QRCodeSVG value={bill.scan_url} size={220} level="M" />
            </div>

            <p className="mt-3 break-all text-xs text-tonki-text-muted">
              {bill.scan_url}
            </p>
          </div>

          <div className="rounded-2xl border border-tonki-border bg-tonki-surface px-4 py-4">
            <p className="text-sm font-semibold text-tonki-text">Escaneado por</p>
            {bill.scanner_name ? (
              <p className="mt-1 text-sm text-tonki-text-secondary">
                <span className="font-semibold text-tonki-text">
                  {bill.scanner_name}
                </span>
                {bill.scanned_at
                  ? ` · ${new Date(bill.scanned_at).toLocaleString("es-MX")}`
                  : null}
              </p>
            ) : (
              <p className="mt-1 text-sm text-tonki-text-muted">
                Esperando escaneo…
              </p>
            )}
            {bill.tonkis_awarded > 0 ? (
              <p className="mt-2 text-sm font-semibold text-tonki-accent">
                Cashback: +{bill.tonkis_awarded.toLocaleString("es-MX")} Tonkis
                (1%)
              </p>
            ) : null}
          </div>

          <button
            type="button"
            onClick={handleReset}
            className="w-full rounded-xl border border-tonki-border bg-tonki-canvas py-3 text-sm font-bold text-tonki-text transition-colors hover:bg-tonki-elevated"
          >
            Nueva cuenta
          </button>
        </section>
      )}
    </main>
  );
}
