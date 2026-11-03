"use client";

import { useEffect, useMemo, useState } from "react";

import { readJsonSafely } from "src/lib/api/readJsonSafely";
import {
  allDynamicsClosed,
  canParticipate,
  dynamicProgressText,
  dynamicScheduleText,
  kindLabel,
  markViewerParticipated,
  normalizePostDynamics,
  phaseLabel,
  readParticipateResult,
  type NormalizedDynamic,
} from "src/lib/posts/dynamicClient";
import type { DynamicPhase } from "src/lib/posts/dynamics/constants";

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

function useNow(enabled: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [enabled]);
  return now;
}

function closedReason(dynamic: NormalizedDynamic): string | null {
  if (dynamic.viewer_participated) return "Ya participaste.";
  if (dynamic.phase === "upcoming") return "Todavía no empieza.";
  if (dynamic.phase === "exhausted") return "Esta dinámica ya se agotó.";
  if (dynamic.phase === "expired") return "Esta dinámica ya venció.";
  return null;
}

export function PostDynamicsPanel({
  postId,
  dynamics,
  variant,
  onChange,
}: {
  postId: string;
  dynamics: unknown;
  variant: "compact" | "actions";
  onChange?: (dynamics: NormalizedDynamic[]) => void;
}) {
  const normalized = useMemo(() => normalizePostDynamics(dynamics), [dynamics]);
  const [overrides, setOverrides] = useState<Record<string, NormalizedDynamic>>({});
  const [codes, setCodes] = useState<Record<string, string>>({});
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const needsClock = normalized.some(
    (dynamic) => dynamic.kind === "time_promo" && dynamic.phase === "active" && dynamic.ends_at
  );
  const now = useNow(needsClock);
  const shown = normalized.map((dynamic) => overrides[dynamic.dynamic_id] ?? dynamic);

  useEffect(() => {
    setOverrides({});
  }, [normalized]);

  if (shown.length === 0) return null;

  const closed = allDynamicsClosed(shown);

  async function participate(
    dynamic: NormalizedDynamic,
    body: { source: "going" } | { source: "promo_code"; code: string }
  ) {
    if (!canParticipate(dynamic) || pendingId) return;
    setPendingId(dynamic.dynamic_id);
    setErrors((prev) => ({ ...prev, [dynamic.dynamic_id]: "" }));
    setNotes((prev) => ({ ...prev, [dynamic.dynamic_id]: "" }));
    try {
      const res = await fetch(
        `/api/posts/${postId}/dynamics/${encodeURIComponent(dynamic.dynamic_id)}/participate`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );
      const payload = await readJsonSafely(res);
      const result = readParticipateResult(payload, res.ok);
      if (!result.ok) {
        setErrors((prev) => ({ ...prev, [dynamic.dynamic_id]: result.error }));
        return;
      }
      const nextDynamic = result.dynamic ?? markViewerParticipated(dynamic);
      const next = shown.map((item) =>
        item.dynamic_id === dynamic.dynamic_id ? nextDynamic : item
      );
      setOverrides((prev) => ({ ...prev, [dynamic.dynamic_id]: nextDynamic }));
      if (result.message) {
        setNotes((prev) => ({ ...prev, [dynamic.dynamic_id]: result.message ?? "" }));
      }
      onChange?.(next);
    } catch {
      setErrors((prev) => ({
        ...prev,
        [dynamic.dynamic_id]: "Error de red. Intenta de nuevo.",
      }));
    } finally {
      setPendingId(null);
    }
  }

  return (
    <section className="mt-3 flex flex-col gap-2" aria-label="Dinámicas">
      {closed ? (
        <p className="rounded-xl border border-tonki-border bg-tonki-elevated/70 px-3 py-2 text-sm text-tonki-text-secondary">
          Las dinámicas terminaron.
        </p>
      ) : null}
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {shown.map((dynamic) => {
          const progress = dynamicProgressText(dynamic);
          const schedule = dynamicScheduleText(dynamic, now);
          const reason = closedReason(dynamic);
          const enabled = canParticipate(dynamic);
          const pending = pendingId === dynamic.dynamic_id;
          return (
            <li
              key={dynamic.dynamic_id}
              className="rounded-2xl border border-tonki-border bg-tonki-surface px-3 py-2.5"
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
              {dynamic.kind === "consumption" && dynamic.min_ticket ? (
                <p className="mt-1 text-xs text-tonki-text-muted">
                  Ticket mínimo {dynamic.min_ticket}
                </p>
              ) : null}
              {dynamic.kind === "consumption" && dynamic.product_ids.length > 0 ? (
                <p className="mt-1 text-xs text-tonki-text-muted">
                  Solo cuentan cobros con los productos de la promo.
                </p>
              ) : null}

              {variant === "actions" && dynamic.kind === "going" ? (
                <div className="mt-2">
                  <button
                    type="button"
                    disabled={!enabled || pending}
                    onClick={() => void participate(dynamic, { source: "going" })}
                    className="rounded-full bg-tonki-accent px-4 py-1.5 text-sm font-bold text-tonki-accent-fg transition-colors hover:bg-tonki-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {pending ? "Enviando…" : "Voy"}
                  </button>
                  {reason && !notes[dynamic.dynamic_id] ? (
                    <p className="mt-1 text-xs text-tonki-text-muted">{reason}</p>
                  ) : null}
                </div>
              ) : null}

              {variant === "actions" && dynamic.kind === "promo_code" ? (
                <div className="mt-2 flex flex-col gap-2">
                  <div className="flex flex-wrap gap-2">
                    <input
                      value={codes[dynamic.dynamic_id] ?? ""}
                      disabled={!enabled || pending}
                      autoComplete="off"
                      spellCheck={false}
                      maxLength={32}
                      placeholder="Código"
                      aria-label="Código de la dinámica"
                      onChange={(event) =>
                        setCodes((prev) => ({
                          ...prev,
                          [dynamic.dynamic_id]: event.target.value,
                        }))
                      }
                      onKeyDown={(event) => {
                        if (event.key !== "Enter") return;
                        event.preventDefault();
                        const code = (codes[dynamic.dynamic_id] ?? "").trim();
                        if (!code) {
                          setErrors((prev) => ({
                            ...prev,
                            [dynamic.dynamic_id]: "Escribe el código",
                          }));
                          return;
                        }
                        void participate(dynamic, { source: "promo_code", code });
                      }}
                      className="min-w-[8rem] flex-1 rounded-xl border border-tonki-border bg-tonki-surface px-3 py-1.5 text-sm text-tonki-text outline-none focus:border-tonki-accent disabled:opacity-60"
                    />
                    <button
                      type="button"
                      disabled={!enabled || pending}
                      onClick={() => {
                        const code = (codes[dynamic.dynamic_id] ?? "").trim();
                        if (!code) {
                          setErrors((prev) => ({
                            ...prev,
                            [dynamic.dynamic_id]: "Escribe el código",
                          }));
                          return;
                        }
                        void participate(dynamic, { source: "promo_code", code });
                      }}
                      className="rounded-full bg-tonki-accent px-4 py-1.5 text-sm font-bold text-tonki-accent-fg transition-colors hover:bg-tonki-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {pending ? "Canjeando…" : "Canjear"}
                    </button>
                  </div>
                  {reason && !notes[dynamic.dynamic_id] ? (
                    <p className="text-xs text-tonki-text-muted">{reason}</p>
                  ) : null}
                </div>
              ) : null}

              {variant === "actions" && dynamic.kind === "qr" ? (
                <p className="mt-2 text-xs text-tonki-text-muted">
                  Participas escaneando el QR del negocio.
                </p>
              ) : null}
              {variant === "actions" && dynamic.kind === "consumption" ? (
                <p className="mt-2 text-xs text-tonki-text-muted">
                  Se suma con los cobros acreditados de este negocio.
                </p>
              ) : null}
              {notes[dynamic.dynamic_id] ? (
                <p className="mt-2 text-xs text-emerald-700">{notes[dynamic.dynamic_id]}</p>
              ) : null}
              {errors[dynamic.dynamic_id] ? (
                <p role="alert" className="mt-2 text-xs text-tonki-danger">
                  {errors[dynamic.dynamic_id]}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
