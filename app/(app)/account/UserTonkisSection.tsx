"use client";

import { useEffect, useState } from "react";

import { readJsonSafely } from "src/lib/api/readJsonSafely";
import type { TonkisCredit } from "src/lib/account/types";

type TonkisResponse =
  | { success: true; total_points: number; recent: TonkisCredit[] }
  | { success: false; error?: string };

function formatPoints(value: number): string {
  return value.toLocaleString("es-MX");
}

export function UserTonkisSection() {
  const [loading, setLoading] = useState(true);
  const [totalPoints, setTotalPoints] = useState(0);
  const [recent, setRecent] = useState<TonkisCredit[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/account/tonkis", {
          credentials: "include",
        });
        const data = await readJsonSafely<TonkisResponse>(res);
        if (cancelled) return;
        if (!res.ok || !data?.success) {
          setError(
            data && "error" in data && data.error
              ? data.error
              : "No se pudieron cargar tus Tonkis"
          );
          return;
        }
        setTotalPoints(data.total_points);
        setRecent(data.recent);
      } catch {
        if (!cancelled) setError("No se pudieron cargar tus Tonkis");
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
    <div className="mt-8 space-y-4">
      <section className="overflow-hidden rounded-2xl bg-tonki-accent p-5 text-tonki-accent-fg">
        <p className="text-sm font-semibold uppercase tracking-wider text-tonki-accent-fg/70">
          Tus Tonkis
        </p>
        <p className="mt-1 text-4xl font-bold tracking-tight">
          {loading ? "…" : formatPoints(totalPoints)}
        </p>
        <p className="mt-4 text-sm font-medium text-tonki-accent-fg/80">
          Puntos acumulados por tus consumos.
        </p>
      </section>

      <section className="rounded-2xl border border-tonki-border bg-tonki-surface p-6 shadow-sm">
        <h2 className="text-lg font-bold text-tonki-text">
          Últimos Tonkis acreditados
        </h2>
        {loading ? (
          <p className="mt-4 text-sm text-tonki-text-muted">Cargando…</p>
        ) : error ? (
          <p role="alert" className="mt-4 text-sm text-tonki-danger">
            {error}
          </p>
        ) : recent.length === 0 ? (
          <p className="mt-4 text-sm text-tonki-text-muted">
            Aún no tienes consumos acreditados.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-tonki-border">
            {recent.map((item) => (
              <li
                key={item.charge_id}
                className="flex items-center justify-between gap-3 py-3"
              >
                <span className="min-w-0 truncate text-sm font-medium text-tonki-text">
                  {item.establishment_name}
                </span>
                <span className="shrink-0 text-sm font-bold text-tonki-text">
                  {formatPoints(item.points)} Tonkis
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
