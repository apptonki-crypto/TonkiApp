"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { readJsonSafely } from "src/lib/api/readJsonSafely";
import { MAX_POST_DYNAMICS, type DynamicKind } from "src/lib/posts/dynamics/constants";
import {
  createEmptyDraft,
  kindLabel,
  type DynamicDraft,
} from "src/lib/posts/dynamicClient";

import {
  DynamicDraftFields,
  type DynamicProductOption,
} from "./DynamicDraftFields";

const KIND_MENU: DynamicKind[] = [
  "time_promo",
  "going",
  "promo_code",
  "qr",
  "consumption",
];

const selectClass =
  "rounded-xl border border-tonki-border bg-tonki-surface px-3 py-2 text-sm text-tonki-text outline-none focus:border-tonki-accent";

export function PostDynamicsComposer({
  drafts,
  onChange,
}: {
  drafts: DynamicDraft[];
  onChange: (next: DynamicDraft[]) => void;
}) {
  const [kindToAdd, setKindToAdd] = useState<DynamicKind>("time_promo");
  const [establishmentId, setEstablishmentId] = useState<string | null>(null);
  const [establishmentReady, setEstablishmentReady] = useState(false);
  const [products, setProducts] = useState<DynamicProductOption[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productsError, setProductsError] = useState<string | null>(null);
  const needsProducts = drafts.some((draft) => draft.kind === "consumption");
  const atMax = drafts.length >= MAX_POST_DYNAMICS;
  const consumptionBlocked = establishmentReady && !establishmentId;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/establishment", { credentials: "include" });
        const data = await readJsonSafely<{
          success?: boolean;
          establishment?: { establishment_id?: string } | null;
        }>(res);
        if (cancelled) return;
        const id =
          res.ok && data?.success && data.establishment?.establishment_id
            ? data.establishment.establishment_id
            : null;
        setEstablishmentId(id);
      } catch {
        if (!cancelled) setEstablishmentId(null);
      } finally {
        if (!cancelled) setEstablishmentReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!needsProducts) return;
    let cancelled = false;
    setProductsLoading(true);
    void (async () => {
      try {
        const res = await fetch("/api/admin/crm/products", { credentials: "include" });
        const data = await readJsonSafely<{
          success?: boolean;
          error?: string;
          products?: { product_id?: string; name?: string; is_active?: boolean }[];
        }>(res);
        if (cancelled) return;
        if (!res.ok || !data?.success || !Array.isArray(data.products)) {
          setProducts([]);
          setProductsError(data?.error ?? "No se pudieron cargar los productos");
          return;
        }
        setProducts(
          data.products.flatMap((product) => {
            if (product.is_active === false) return [];
            if (!product.product_id || !product.name) return [];
            return [{ product_id: product.product_id, name: product.name }];
          })
        );
        setProductsError(null);
      } catch {
        if (!cancelled) {
          setProducts([]);
          setProductsError("No se pudieron cargar los productos");
        }
      } finally {
        if (!cancelled) setProductsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [needsProducts]);

  const addKind = () => {
    if (atMax) return;
    if (kindToAdd === "consumption" && !establishmentId) return;
    const draft = createEmptyDraft(kindToAdd, establishmentId);
    if (!draft) return;
    onChange([...drafts, draft]);
  };

  return (
    <section className="rounded-2xl border border-tonki-border bg-tonki-canvas/40 p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-tonki-text">Dinámicas</h3>
        <span className="text-xs tabular-nums text-tonki-text-muted">
          {drafts.length}/{MAX_POST_DYNAMICS}
        </span>
      </div>
      <p className="mt-1 text-xs text-tonki-text-muted">
        Puedes añadir hasta 5. Cada una se cierra sola; la publicación sigue en el feed.
      </p>

      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-xs font-medium text-tonki-text-muted">
          Añadir dinámica
          <select
            value={kindToAdd}
            disabled={atMax}
            onChange={(event) => setKindToAdd(event.target.value as DynamicKind)}
            className={selectClass}
          >
            {KIND_MENU.map((kind) => (
              <option
                key={kind}
                value={kind}
                disabled={kind === "consumption" && consumptionBlocked}
              >
                {kindLabel(kind)}
                {kind === "consumption" && consumptionBlocked ? " (sin negocio)" : ""}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={addKind}
          disabled={atMax || (kindToAdd === "consumption" && !establishmentId)}
          className="rounded-full border border-tonki-border px-4 py-2 text-sm font-semibold text-tonki-text-secondary transition hover:bg-tonki-surface-hover disabled:cursor-not-allowed disabled:opacity-60"
        >
          Añadir
        </button>
      </div>

      {consumptionBlocked ? (
        <p className="mt-2 text-xs text-tonki-text-muted">
          Completa el perfil del negocio para crear una dinámica de consumo.{" "}
          <Link href="/account" className="font-semibold text-tonki-accent hover:underline">
            Ir a tu cuenta
          </Link>
        </p>
      ) : null}
      {atMax ? (
        <p className="mt-2 text-xs text-tonki-text-muted">
          Una publicación admite hasta 5 dinámicas.
        </p>
      ) : null}

      {drafts.length > 0 ? (
        <ul className="mt-3 flex list-none flex-col gap-3 p-0">
          {drafts.map((draft) => (
            <li
              key={draft.localId}
              className="rounded-2xl border border-tonki-border bg-tonki-surface p-3"
            >
              <DynamicDraftFields
                draft={draft}
                products={products}
                productsLoading={productsLoading}
                productsError={productsError}
                onChange={(next) =>
                  onChange(drafts.map((item) => (item.localId === draft.localId ? next : item)))
                }
              />
              <div className="mt-3 flex justify-end">
                <button
                  type="button"
                  onClick={() => onChange(drafts.filter((item) => item.localId !== draft.localId))}
                  className="rounded-full px-3 py-1 text-xs font-semibold text-tonki-text-muted ring-1 ring-tonki-border hover:bg-red-50 hover:text-tonki-danger"
                >
                  Quitar
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
