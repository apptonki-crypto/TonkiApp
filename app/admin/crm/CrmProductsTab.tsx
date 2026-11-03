"use client";

import { useCallback, useState, type FormEvent } from "react";

import {
  createCrmProduct,
  updateCrmProduct,
} from "src/lib/crm/fetchCrmClient";
import type { CrmProduct } from "src/lib/crm/types";

const FIELD =
  "w-full rounded-xl border border-tonki-border bg-tonki-canvas px-4 py-3 text-tonki-text outline-none transition-colors focus:border-tonki-accent";

function formatMoney(value: string): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  return n.toLocaleString("es-MX", { style: "currency", currency: "MXN" });
}

type Props = {
  products: CrmProduct[];
  onProductsChange: (products: CrmProduct[]) => void;
};

export function CrmProductsTab({ products, onProductsChange }: Props) {
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [description, setDescription] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const handleCreate = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setError(null);
      setSaving(true);
      try {
        const result = await createCrmProduct(
          {
            name: name.trim(),
            sku: sku.trim() || undefined,
            description: description.trim() || undefined,
            unit_price: unitPrice.trim(),
          },
          { networkErrorMessage: "No se pudo crear el producto" }
        );
        if (!result.ok) {
          setError(result.error);
          return;
        }
        onProductsChange([result.product, ...products]);
        setName("");
        setSku("");
        setDescription("");
        setUnitPrice("");
      } finally {
        setSaving(false);
      }
    },
    [description, name, onProductsChange, products, sku, unitPrice]
  );

  const toggleActive = useCallback(
    async (product: CrmProduct) => {
      setBusyId(product.product_id);
      setError(null);
      try {
        const result = await updateCrmProduct(
          product.product_id,
          { is_active: !product.is_active },
          { networkErrorMessage: "No se pudo actualizar el producto" }
        );
        if (!result.ok) {
          setError(result.error);
          return;
        }
        onProductsChange(
          products.map((p) =>
            p.product_id === product.product_id ? result.product : p
          )
        );
      } finally {
        setBusyId(null);
      }
    },
    [onProductsChange, products]
  );

  return (
    <div className="space-y-6 px-4 py-6">
      <section className="rounded-2xl border border-tonki-border bg-tonki-surface p-5 shadow-sm">
        <h2 className="text-base font-semibold text-tonki-text">
          Agregar producto
        </h2>
        <p className="mt-1 text-sm text-tonki-text-muted">
          Opcional: desglosa ventas por ítem. También puedes registrar solo con
          monto en Resumen o Ventas.
        </p>

        <form onSubmit={(e) => void handleCreate(e)} className="mt-4 space-y-3">
          <div>
            <label htmlFor="crm-product-name" className="mb-1 block text-sm font-medium">
              Nombre
            </label>
            <input
              id="crm-product-name"
              required
              maxLength={150}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={FIELD}
              placeholder="Café americano"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="crm-product-sku" className="mb-1 block text-sm font-medium">
                SKU (opcional)
              </label>
              <input
                id="crm-product-sku"
                maxLength={64}
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                className={FIELD}
              />
            </div>
            <div>
              <label htmlFor="crm-product-price" className="mb-1 block text-sm font-medium">
                Precio (MXN)
              </label>
              <input
                id="crm-product-price"
                required
                inputMode="decimal"
                value={unitPrice}
                onChange={(e) => setUnitPrice(e.target.value)}
                className={FIELD}
                placeholder="45.00"
              />
            </div>
          </div>
          <div>
            <label
              htmlFor="crm-product-desc"
              className="mb-1 block text-sm font-medium"
            >
              Descripción (opcional)
            </label>
            <textarea
              id="crm-product-desc"
              maxLength={500}
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={FIELD}
            />
          </div>

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
            disabled={saving}
            className="w-full rounded-xl bg-tonki-accent px-4 py-3 text-base font-bold text-tonki-accent-fg transition-colors hover:bg-tonki-accent-hover disabled:opacity-60"
          >
            {saving ? "Guardando…" : "Crear producto"}
          </button>
        </form>
      </section>

      <section className="rounded-2xl border border-tonki-border bg-tonki-surface shadow-sm">
        <h2 className="border-b border-tonki-border px-4 py-3 text-sm font-semibold text-tonki-text-secondary">
          Catálogo ({products.length})
        </h2>
        {products.length === 0 ? (
          <p className="px-4 py-6 text-sm text-tonki-text-muted">
            No hay productos todavía.
          </p>
        ) : (
          <ul className="divide-y divide-tonki-border">
            {products.map((product) => (
              <li
                key={product.product_id}
                className={`flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${
                  product.is_active ? "" : "opacity-60"
                }`}
              >
                <div className="min-w-0">
                  <p className="font-semibold text-tonki-text">{product.name}</p>
                  <p className="text-sm tabular-nums text-tonki-text-secondary">
                    {formatMoney(product.unit_price)}
                    {product.sku ? (
                      <span className="text-tonki-text-faint"> · {product.sku}</span>
                    ) : null}
                  </p>
                  {product.description ? (
                    <p className="mt-0.5 line-clamp-2 text-xs text-tonki-text-faint">
                      {product.description}
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  disabled={busyId === product.product_id}
                  onClick={() => void toggleActive(product)}
                  className="shrink-0 rounded-xl border border-tonki-border px-3 py-2 text-sm font-semibold text-tonki-accent transition-colors hover:bg-tonki-elevated disabled:opacity-60"
                >
                  {busyId === product.product_id
                    ? "…"
                    : product.is_active
                      ? "Desactivar"
                      : "Activar"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
