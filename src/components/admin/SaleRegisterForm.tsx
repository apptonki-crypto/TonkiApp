"use client";

import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";

import { readJsonSafely } from "src/lib/api/readJsonSafely";
import type { CreatedCharge } from "src/lib/charges/types";
import {
  centsFromPesosInput,
  tonkisFromAmountCents,
} from "src/lib/charges/tonkis";
import type { CrmProduct } from "src/lib/crm/types";

type ChargeResponse =
  | { success: true; message?: string; charge: CreatedCharge }
  | { success: false; error?: string };

type RegisterMode = "amount" | "products";

function formatMoney(amount: string): string {
  const value = Number(amount);
  if (!Number.isFinite(value)) return amount;
  return value.toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
  });
}

function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export type SaleRegisterFormProps = {
  cashbackPercent: number;
  products: CrmProduct[];
  onRegistered?: () => void;
  amountModeLabel: string;
  productsModeLabel: string;
  amountFieldId: string;
  amountFieldLabel: string;
  amountHint?: string;
  submitLabel: string;
  savingLabel?: string;
  errorFallback: string;
  fieldClassName: string;
  result: "compact" | "detailed";
  /** Permite abrir el modo productos aunque el catálogo esté vacío. */
  allowEmptyProductMode?: boolean;
  emptyCatalog?: ReactNode;
};

export function SaleRegisterForm({
  cashbackPercent,
  products,
  onRegistered,
  amountModeLabel,
  productsModeLabel,
  amountFieldId,
  amountFieldLabel,
  amountHint,
  submitLabel,
  savingLabel = "Generando…",
  errorFallback,
  fieldClassName,
  result,
  allowEmptyProductMode = false,
  emptyCatalog,
}: SaleRegisterFormProps) {
  const [mode, setMode] = useState<RegisterMode>("amount");
  const [amount, setAmount] = useState("");
  const [cartQty, setCartQty] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [charge, setCharge] = useState<CreatedCharge | null>(null);

  const activeProducts = products.filter((product) => product.is_active);

  useEffect(() => {
    if (
      !allowEmptyProductMode &&
      mode === "products" &&
      activeProducts.length === 0
    ) {
      setMode("amount");
    }
  }, [activeProducts.length, allowEmptyProductMode, mode]);

  const cartLines = activeProducts
    .map((product) => ({
      product,
      quantity: cartQty[product.product_id] ?? 0,
    }))
    .filter((line) => line.quantity > 0);

  const cartTotalCents = cartLines.reduce((sum, line) => {
    const unitCents = centsFromPesosInput(line.product.unit_price);
    if (unitCents === null) return sum;
    return sum + unitCents * line.quantity;
  }, 0);

  const cents =
    mode === "products"
      ? cartTotalCents > 0
        ? cartTotalCents
        : null
      : centsFromPesosInput(amount);

  const pointsPreview =
    cents !== null ? tonkisFromAmountCents(cents, cashbackPercent) : null;

  const switchMode = (next: RegisterMode) => {
    setMode(next);
    setCharge(null);
    setError(null);
  };

  const bumpQty = (productId: string, delta: number) => {
    setCartQty((prev) => {
      const next = Math.max(0, Math.min(999, (prev[productId] ?? 0) + delta));
      if (next === 0) {
        const { [productId]: _removed, ...rest } = prev;
        return rest;
      }
      return { ...prev, [productId]: next };
    });
    setCharge(null);
    setError(null);
  };

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setError(null);
      setSaving(true);
      try {
        const body =
          mode === "products"
            ? {
                items: cartLines.map((line) => ({
                  product_id: line.product.product_id,
                  quantity: line.quantity,
                })),
              }
            : { amount: amount.trim() };

        const res = await fetch("/api/charges", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await readJsonSafely<ChargeResponse>(res);
        if (!res.ok || !data?.success || !("charge" in data)) {
          setError(
            data && "error" in data && data.error ? data.error : errorFallback
          );
          return;
        }
        setCharge(data.charge);
        onRegistered?.();
      } catch {
        setError(errorFallback);
      } finally {
        setSaving(false);
      }
    },
    [amount, cartLines, errorFallback, mode, onRegistered]
  );

  const productsDisabled =
    !allowEmptyProductMode && activeProducts.length === 0;

  return (
    <div className="space-y-4">
      <div className="flex rounded-xl border border-tonki-border p-1">
        <button
          type="button"
          onClick={() => switchMode("amount")}
          className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
            mode === "amount"
              ? "bg-tonki-accent text-tonki-accent-fg"
              : "text-tonki-text-muted hover:bg-tonki-elevated"
          }`}
        >
          {amountModeLabel}
        </button>
        <button
          type="button"
          disabled={productsDisabled}
          onClick={() => switchMode("products")}
          className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
            mode === "products"
              ? "bg-tonki-accent text-tonki-accent-fg"
              : "text-tonki-text-muted hover:bg-tonki-elevated"
          }`}
        >
          {productsModeLabel}
        </button>
      </div>

      <form onSubmit={(event) => void handleSubmit(event)} className="space-y-4">
        {mode === "amount" ? (
          <div>
            <label
              htmlFor={amountFieldId}
              className="mb-1.5 block text-sm font-medium text-tonki-text"
            >
              {amountFieldLabel}
            </label>
            <input
              id={amountFieldId}
              name="amount"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              required
              placeholder="150.00"
              value={amount}
              onChange={(event) => {
                setAmount(event.target.value);
                setCharge(null);
                setError(null);
              }}
              className={fieldClassName}
            />
            {amountHint ? (
              <p className="mt-1 text-xs text-tonki-text-faint">{amountHint}</p>
            ) : null}
          </div>
        ) : activeProducts.length === 0 ? (
          emptyCatalog ?? (
            <p className="text-sm text-tonki-text-secondary">
              No hay productos activos. Puedes registrar la venta solo con monto.
            </p>
          )
        ) : (
          <ul className="space-y-2">
            {activeProducts.map((product) => {
              const qty = cartQty[product.product_id] ?? 0;
              return (
                <li
                  key={product.product_id}
                  className="flex items-center gap-3 rounded-xl border border-tonki-border bg-tonki-canvas px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-tonki-text">
                      {product.name}
                    </p>
                    <p className="text-xs text-tonki-text-faint">
                      {formatMoney(product.unit_price)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      aria-label={`Menos ${product.name}`}
                      onClick={() => bumpQty(product.product_id, -1)}
                      className="flex h-9 w-9 items-center justify-center rounded-lg border border-tonki-border text-lg font-bold text-tonki-text"
                    >
                      −
                    </button>
                    <span className="w-6 text-center text-sm font-semibold tabular-nums">
                      {qty}
                    </span>
                    <button
                      type="button"
                      aria-label={`Más ${product.name}`}
                      onClick={() => bumpQty(product.product_id, 1)}
                      className="flex h-9 w-9 items-center justify-center rounded-lg border border-tonki-border text-lg font-bold text-tonki-text"
                    >
                      +
                    </button>
                  </div>
                </li>
              );
            })}
            {cartLines.length > 0 ? (
              <p className="text-sm font-semibold text-tonki-text">
                Total: {formatMoney((cartTotalCents / 100).toFixed(2))}
              </p>
            ) : null}
          </ul>
        )}

        {pointsPreview !== null ? (
          <p className="text-sm text-tonki-text-secondary">
            {pointsPreview > 0
              ? result === "detailed"
                ? `El cliente recibirá ${pointsPreview.toLocaleString("es-MX")} Tonkis.`
                : `Tonkis al confirmar: ${pointsPreview.toLocaleString("es-MX")}`
              : "Ese monto no alcanza para acreditar Tonkis."}
          </p>
        ) : null}

        {error ? (
          <p
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-tonki-danger"
          >
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={
            saving ||
            pointsPreview === null ||
            pointsPreview <= 0 ||
            (mode === "products" && cartLines.length === 0)
          }
          className="w-full rounded-xl bg-tonki-accent px-4 py-3 text-base font-bold text-tonki-accent-fg transition-colors hover:bg-tonki-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? savingLabel : submitLabel}
        </button>
      </form>

      {charge ? (
        result === "detailed" ? (
          <div className="space-y-4 border-t border-tonki-border pt-6">
            <p className="text-sm font-medium text-tonki-text">
              Muestra este código. Al confirmarlo, se acreditan{" "}
              {charge.points.toLocaleString("es-MX")} Tonkis. No es un pago.
            </p>
            {charge.qr_image.startsWith("data:image/") ? (
              <div className="mx-auto w-full max-w-[280px] rounded-2xl border border-tonki-border bg-tonki-canvas p-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={charge.qr_image}
                  alt="Código para recibir Tonkis"
                  className="h-auto w-full"
                />
              </div>
            ) : null}
            <p className="break-all rounded-xl border border-tonki-border bg-tonki-canvas px-4 py-3 text-sm text-tonki-text-secondary">
              {charge.url}
            </p>
            <ul className="space-y-1 text-sm text-tonki-text-secondary">
              <li>Monto de referencia: {formatMoney(charge.amount)}</li>
              <li>Porcentaje congelado: {charge.cashback_percent}%</li>
              <li>
                Tonkis a acreditar: {charge.points.toLocaleString("es-MX")}
              </li>
              <li>Vence: {formatWhen(charge.expires_at)}</li>
              <li>Un solo uso. El mismo código no acredita dos veces.</li>
            </ul>
          </div>
        ) : (
          <div className="space-y-3 border-t border-tonki-border pt-4">
            {charge.qr_image.startsWith("data:image/") ? (
              <div className="mx-auto w-full max-w-[220px] rounded-xl border border-tonki-border bg-tonki-canvas p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={charge.qr_image}
                  alt="Código de venta"
                  className="h-auto w-full"
                />
              </div>
            ) : null}
            <p className="text-sm text-tonki-text-secondary">
              Monto: {formatMoney(charge.amount)} · Vence:{" "}
              {formatWhen(charge.expires_at)}
            </p>
          </div>
        )
      ) : null}
    </div>
  );
}
