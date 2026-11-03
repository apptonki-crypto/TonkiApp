"use client";

import { useEffect, useMemo, useState } from "react";

import { readJsonSafely } from "src/lib/api/readJsonSafely";
import {
  DynamicDraftFields,
  type DynamicProductOption,
} from "src/components/posts/DynamicDraftFields";
import {
  buildDynamicCreate,
  canEditDynamicConfig,
  canManualClose,
  draftFromDynamic,
  dynamicProgressText,
  dynamicScheduleText,
  hasNoParticipations,
  kindLabel,
  normalizePostDynamics,
  phaseLabel,
  readQrImage,
  recallPromoCode,
  type DynamicDraft,
  type DynamicPatchJson,
  type NormalizedDynamic,
} from "src/lib/posts/dynamicClient";
import type { DynamicPhase } from "src/lib/posts/dynamics/constants";
import type { FeedPost } from "src/lib/posts/feedTypes";

function phaseClass(phase: DynamicPhase): string {
  switch (phase) {
    case "active":
      return "border-tonki-accent/40 bg-tonki-accent/10 text-tonki-accent";
    case "upcoming":
      return "border-amber-300 bg-amber-50 text-amber-800";
    case "exhausted":
      return "border-tonki-border bg-tonki-elevated text-tonki-text-muted";
    case "expired":
      return "border-tonki-border bg-tonki-surface text-tonki-text-muted";
    default: {
      const unreachable: never = phase;
      return unreachable;
    }
  }
}

type AuthorDynamics = {
  included: boolean;
  dynamics: NormalizedDynamic[];
};

async function fetchAuthorDynamics(postId: string): Promise<AuthorDynamics | null> {
  const res = await fetch(`/api/posts/${postId}`, { credentials: "include" });
  const data = await readJsonSafely<{
    success?: boolean;
    post?: { dynamics?: unknown };
  }>(res);
  if (!res.ok || !data?.success || !data.post) return null;
  if (!Object.prototype.hasOwnProperty.call(data.post, "dynamics")) {
    return { included: false, dynamics: [] };
  }
  return {
    included: true,
    dynamics: normalizePostDynamics(data.post.dynamics, { includeAuthorSecrets: true }),
  };
}

export function AdminPostDynamics({
  post,
  onDynamicsChange,
}: {
  post: FeedPost;
  onDynamicsChange: (dynamics: NormalizedDynamic[]) => void;
}) {
  const listDynamics = useMemo(
    () => normalizePostDynamics(post.dynamics, { includeAuthorSecrets: true }),
    [post.dynamics]
  );
  const [remote, setRemote] = useState<NormalizedDynamic[] | null>(null);
  const [recalled, setRecalled] = useState<Record<string, string>>({});
  const [qrImages, setQrImages] = useState<
    Record<string, { ok: true; image: string } | { ok: false }>
  >({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<DynamicDraft | null>(null);
  const [products, setProducts] = useState<DynamicProductOption[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productsError, setProductsError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const displayed = remote ?? listDynamics;
  const qrKey = displayed
    .filter((dynamic) => dynamic.kind === "qr")
    .map((dynamic) => dynamic.dynamic_id)
    .join("|");
  const promoKey = displayed
    .filter((dynamic) => dynamic.kind === "promo_code")
    .map((dynamic) => `${dynamic.dynamic_id}:${dynamic.code ?? ""}`)
    .join("|");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const detail = await fetchAuthorDynamics(post.post_id);
        if (cancelled) return;
        if (!detail?.included) {
          setRemote(null);
          return;
        }
        setRemote(detail.dynamics);
      } catch {
        if (!cancelled) setRemote(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [post.post_id, post.updated_at, listDynamics]);

  useEffect(() => {
    let promoIndex = 0;
    const next: Record<string, string> = {};
    for (const dynamic of displayed) {
      if (dynamic.kind !== "promo_code") continue;
      const index = promoIndex;
      promoIndex += 1;
      if (dynamic.code) continue;
      const code = recallPromoCode(post.post_id, dynamic.dynamic_id, index);
      if (code) next[dynamic.dynamic_id] = code;
    }
    setRecalled(next);
  }, [post.post_id, promoKey, displayed]);

  useEffect(() => {
    if (!qrKey) return;
    let cancelled = false;
    const ids = qrKey.split("|").filter(Boolean);
    for (const dynamicId of ids) {
      void (async () => {
        try {
          const res = await fetch(
            `/api/posts/${post.post_id}/dynamics/${encodeURIComponent(dynamicId)}/qr`,
            { credentials: "include" }
          );
          const data = await readJsonSafely(res);
          const image = res.ok ? readQrImage(data) : null;
          if (cancelled) return;
          setQrImages((prev) => ({
            ...prev,
            [dynamicId]: image ? { ok: true, image } : { ok: false },
          }));
        } catch {
          if (!cancelled) {
            setQrImages((prev) => ({ ...prev, [dynamicId]: { ok: false } }));
          }
        }
      })();
    }
    return () => {
      cancelled = true;
    };
  }, [post.post_id, qrKey]);

  useEffect(() => {
    if (editDraft?.kind !== "consumption") return;
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
        if (!cancelled) setProductsError("No se pudieron cargar los productos");
      } finally {
        if (!cancelled) setProductsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [editDraft?.kind]);

  if (displayed.length === 0) return null;

  function applyDynamics(next: NormalizedDynamic[]) {
    setRemote(next);
    onDynamicsChange(next);
    setEditingId(null);
    setEditDraft(null);
  }

  async function patchDynamics(
    patch: DynamicPatchJson,
    fallback: NormalizedDynamic[]
  ) {
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("title", post.title);
      if (post.body?.trim()) fd.append("body", post.body.trim());
      fd.append("dynamics", JSON.stringify(patch));
      const res = await fetch(`/api/posts/${post.post_id}`, {
        method: "PATCH",
        credentials: "include",
        body: fd,
      });
      const payload = await readJsonSafely<{
        success?: boolean;
        error?: string;
        dynamics?: unknown;
        post?: { dynamics?: unknown };
      }>(res);
      if (!res.ok || payload?.success === false) {
        setError(payload?.error ?? "No se pudo actualizar la dinámica.");
        return;
      }
      const payloadRecord = payload?.post;
      const payloadHasDynamics = Boolean(
        (payload && Object.prototype.hasOwnProperty.call(payload, "dynamics")) ||
          (payloadRecord && Object.prototype.hasOwnProperty.call(payloadRecord, "dynamics"))
      );
      if (payloadHasDynamics) {
        applyDynamics(
          normalizePostDynamics(payload?.dynamics ?? payloadRecord?.dynamics, {
            includeAuthorSecrets: true,
          })
        );
        return;
      }
      const detail = await fetchAuthorDynamics(post.post_id);
      if (detail?.included) {
        applyDynamics(detail.dynamics);
        return;
      }
      applyDynamics(fallback);
    } catch {
      setError("Error de red. Intenta de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  async function startEdit(dynamic: NormalizedDynamic, code: string | null) {
    let establishmentId = dynamic.establishment_id;
    if (dynamic.kind === "consumption" && !establishmentId) {
      try {
        const res = await fetch("/api/establishment", { credentials: "include" });
        const data = await readJsonSafely<{
          success?: boolean;
          establishment?: { establishment_id?: string } | null;
        }>(res);
        establishmentId =
          res.ok && data?.success ? data.establishment?.establishment_id ?? null : null;
      } catch {
        establishmentId = null;
      }
    }
    const draft = draftFromDynamic(
      establishmentId ? { ...dynamic, establishment_id: establishmentId } : dynamic,
      { code, establishmentId }
    );
    if (!draft) {
      setError("No se puede editar esta dinámica sin su código.");
      return;
    }
    setError(null);
    setEditingId(dynamic.dynamic_id);
    setEditDraft(draft);
  }

  return (
    <section className="mt-2 flex flex-col gap-2" aria-label="Dinámicas de la publicación">
      {displayed.map((dynamic) => {
        const code =
          dynamic.kind === "promo_code"
            ? dynamic.code ?? recalled[dynamic.dynamic_id] ?? null
            : null;
        const progress = dynamicProgressText(dynamic);
        const schedule = dynamicScheduleText(dynamic, Date.now());
        const editable = canEditDynamicConfig(dynamic);
        const qr = qrImages[dynamic.dynamic_id];
        const editing = editingId === dynamic.dynamic_id;
        return (
          <article
            key={dynamic.dynamic_id}
            className="rounded-2xl border border-tonki-border bg-tonki-canvas/50 p-3"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold ${phaseClass(dynamic.phase)}`}
              >
                {phaseLabel(dynamic.phase)}
              </span>
              <span className="text-xs font-semibold uppercase tracking-wide text-tonki-text-muted">
                {kindLabel(dynamic.kind)}
              </span>
            </div>
            {dynamic.text ? (
              <p className="mt-1 whitespace-pre-wrap text-sm text-tonki-text-secondary">
                {dynamic.text}
              </p>
            ) : null}
            {progress ? (
              <p className="mt-1 text-xs tabular-nums text-tonki-text-muted">{progress}</p>
            ) : null}
            {schedule ? (
              <p className="mt-1 text-xs text-tonki-text-muted">{schedule}</p>
            ) : null}
            {dynamic.kind === "promo_code" ? (
              code ? (
                <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-tonki-text">
                  <span>
                    Código: <span className="font-semibold tracking-wide">{code}</span>
                  </span>
                  <button
                    type="button"
                  onClick={() => {
                    const write = navigator.clipboard?.writeText(code);
                    if (!write) return;
                    void write.then(
                      () => setCopiedId(dynamic.dynamic_id),
                      () => setCopiedId(null)
                    );
                  }}
                    className="rounded-full border border-tonki-border px-2 py-0.5 text-[11px] font-semibold text-tonki-text-secondary hover:bg-tonki-surface-hover"
                  >
                    {copiedId === dynamic.dynamic_id ? "Copiado" : "Copiar"}
                  </button>
                </p>
              ) : (
                <p className="mt-2 text-xs text-tonki-text-muted">
                  El código está oculto en el feed público.
                </p>
              )
            ) : null}
            {dynamic.kind === "qr" ? (
              <div className="mt-2">
                {qr?.ok ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={qr.image}
                    alt="Código QR de la dinámica"
                    className="h-40 w-40 rounded-xl border border-tonki-border bg-white p-2"
                  />
                ) : qr && !qr.ok ? (
                  <p className="text-xs text-tonki-text-muted">No se pudo cargar el QR.</p>
                ) : (
                  <p className="text-xs text-tonki-text-muted">Cargando QR…</p>
                )}
              </div>
            ) : null}

            <div className="mt-2 flex flex-wrap gap-2">
              {canManualClose(dynamic) ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    if (typeof window !== "undefined") {
                      const ok = window.confirm(
                        "¿Cerrar esta dinámica? Quedará agotada y los clientes ya no podrán participar."
                      );
                      if (!ok) return;
                    }
                    const fallback = displayed.map((item) =>
                      item.dynamic_id === dynamic.dynamic_id
                        ? {
                            ...item,
                            phase: "exhausted" as const,
                            status: "exhausted" as const,
                            closed_at: new Date().toISOString(),
                          }
                        : item
                    );
                    void patchDynamics({ close_ids: [dynamic.dynamic_id] }, fallback);
                  }}
                  className="rounded-full border border-tonki-border px-3 py-1 text-xs font-semibold text-tonki-text-secondary hover:bg-tonki-surface-hover disabled:opacity-50"
                >
                  Cerrar
                </button>
              ) : null}
              {editable ? (
                <button
                  type="button"
                  disabled={busy || (dynamic.kind === "promo_code" && !code)}
                  onClick={() => void startEdit(dynamic, code)}
                  className="rounded-full border border-tonki-border px-3 py-1 text-xs font-semibold text-tonki-text-secondary hover:bg-tonki-surface-hover disabled:opacity-50"
                >
                  Editar configuración
                </button>
              ) : null}
              {hasNoParticipations(dynamic) ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    if (typeof window !== "undefined") {
                      const ok = window.confirm(
                        "¿Quitar esta dinámica? Solo se puede si nadie ha participado."
                      );
                      if (!ok) return;
                    }
                    void patchDynamics(
                      { remove_ids: [dynamic.dynamic_id] },
                      displayed.filter((item) => item.dynamic_id !== dynamic.dynamic_id)
                    );
                  }}
                  className="rounded-full border border-red-200 px-3 py-1 text-xs font-semibold text-tonki-danger hover:bg-red-50 disabled:opacity-50"
                >
                  Quitar
                </button>
              ) : null}
            </div>
            {editable && dynamic.kind === "promo_code" && !code ? (
              <p className="mt-2 text-xs text-tonki-text-muted">
                Sin el código no se puede reconfigurar esta dinámica.
              </p>
            ) : null}
            {editing && editDraft ? (
              <div className="mt-3 rounded-xl border border-tonki-border bg-tonki-surface p-3">
                <DynamicDraftFields
                  draft={editDraft}
                  lockKind
                  products={products}
                  productsLoading={productsLoading}
                  productsError={productsError}
                  onChange={setEditDraft}
                />
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      const built = buildDynamicCreate(editDraft);
                      if (!built.ok) {
                        setError(built.error);
                        return;
                      }
                      if (built.data.kind !== dynamic.kind) {
                        setError("No se puede cambiar el tipo de dinámica.");
                        return;
                      }
                      void patchDynamics(
                        { upserts: [{ ...built.data, dynamic_id: dynamic.dynamic_id }] },
                        displayed
                      );
                    }}
                    className="rounded-full bg-tonki-accent px-4 py-1.5 text-xs font-bold text-tonki-accent-fg hover:bg-tonki-accent-hover disabled:opacity-60"
                  >
                    Guardar configuración
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(null);
                      setEditDraft(null);
                    }}
                    className="rounded-full px-3 py-1.5 text-xs font-semibold text-tonki-text-muted hover:bg-tonki-surface-hover"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : null}
          </article>
        );
      })}
      {error ? (
        <p role="alert" className="text-sm text-tonki-danger">
          {error}
        </p>
      ) : null}
    </section>
  );
}
