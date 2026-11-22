"use client";

import { useEffect, useState } from "react";

import { IconHex } from "src/components/profile/icons";
import { HexBadge, Notice, Panel, initialOf } from "src/components/profile/ui";
import { readJsonSafely } from "src/lib/api/readJsonSafely";
import type { TonkisCredit, TonkisRedemptionMovement } from "src/lib/account/types";

type TonkisResponse =
  | {
      success: true;
      total_points: number;
      recent: TonkisCredit[];
      redemptions?: TonkisRedemptionMovement[];
    }
  | { success: false; error?: string };

type Movement = {
  id: string;
  title: string;
  detail: string;
  points: number;
  at: string;
};

function formatPoints(value: number): string {
  return value.toLocaleString("es-MX");
}

export function UserTonkisSection() {
  const [loading, setLoading] = useState(true);
  const [totalPoints, setTotalPoints] = useState(0);
  const [movements, setMovements] = useState<Movement[]>([]);
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
        setMovements(mergeMovements(data.recent, data.redemptions ?? []));
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
    <div className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <section className="relative isolate flex min-h-52 flex-col justify-between overflow-hidden rounded-3xl bg-tonki-accent p-6 text-tonki-accent-fg shadow-[0_20px_44px_-24px_rgba(157,77,3,0.7)] sm:p-7">
        <div className="tonki-hex-light tonki-mask-fade absolute inset-0 -z-10" />
        <svg
          viewBox="0 0 100 100"
          aria-hidden="true"
          className="absolute -bottom-10 -right-8 -z-10 h-48 w-48 text-tonki-cta/25"
        >
          <path
            d="M50 4 90 27v46L50 96 10 73V27Z"
            fill="none"
            stroke="currentColor"
            strokeWidth={6}
          />
          <path d="M50 26 70 37.5v23L50 72 30 60.5v-23Z" fill="currentColor" />
        </svg>
        <div className="flex items-center gap-2">
          <HexBadge tone="chrome" className="h-9 w-9">
            <IconHex className="h-4 w-4" />
          </HexBadge>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-tonki-accent-fg/75">
            Tu saldo
          </p>
        </div>
        <div className="mt-6">
          <p className="text-5xl font-bold leading-none tracking-tight tabular-nums sm:text-6xl">
            {loading ? (
              <span className="inline-block h-12 w-32 animate-pulse rounded-xl bg-tonki-accent-fg/15" />
            ) : (
              formatPoints(totalPoints)
            )}
          </p>
          <p className="mt-2 text-sm font-semibold text-tonki-accent-fg/80">
            Tonkis disponibles para canjear
          </p>
        </div>
      </section>

      <Panel
        title="Últimos Tonkis"
        description="Acreditaciones y canjes recientes."
      >
        {loading ? (
          <ul className="space-y-3" aria-busy="true">
            {[0, 1, 2].map((key) => (
              <li
                key={key}
                className="h-12 animate-pulse rounded-2xl bg-tonki-surface-hover/50"
              />
            ))}
          </ul>
        ) : error ? (
          <Notice tone="error">{error}</Notice>
        ) : movements.length === 0 ? (
          <div className="flex flex-col items-center rounded-2xl border border-dashed border-tonki-border-strong px-4 py-8 text-center">
            <HexBadge>
              <IconHex className="h-5 w-5" />
            </HexBadge>
            <p className="mt-3 text-sm font-semibold text-tonki-text">
              Aún no tienes consumos acreditados
            </p>
            <p className="mt-1 text-xs text-tonki-text-muted">
              Escanea el QR en tu próximo consumo para ganar Tonkis.
            </p>
          </div>
        ) : (
          <ul className="-mx-2 space-y-1">
            {movements.map((item) => (
              <li
                key={item.id}
                className="flex items-center gap-3 rounded-2xl px-2 py-2.5 transition-colors hover:bg-tonki-surface-hover/50"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-tonki-chrome text-sm font-bold text-tonki-accent">
                  {initialOf(item.title)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-tonki-text">
                    {item.title}
                  </span>
                  <span className="block text-xs text-tonki-text-muted">
                    {item.detail} · {formatDate(item.at)}
                  </span>
                </span>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-sm font-bold tabular-nums ${
                    item.points < 0
                      ? "bg-tonki-surface-hover text-tonki-text"
                      : "bg-tonki-accent/25 text-tonki-text"
                  }`}
                >
                  {item.points < 0 ? "−" : "+"}
                  {formatPoints(Math.abs(item.points))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function mergeMovements(
  credits: TonkisCredit[],
  redemptions: TonkisRedemptionMovement[]
): Movement[] {
  const earned: Movement[] = credits.map((item) => ({
    id: `credit-${item.charge_id}`,
    title: item.establishment_name,
    detail: "Consumo acreditado",
    points: item.points,
    at: item.credited_at,
  }));
  const spent: Movement[] = redemptions.map((item) => ({
    id: `redeem-${item.id}`,
    title: item.title,
    detail:
      item.status === "pending"
        ? `Canje pendiente · ${item.establishment_name}`
        : `Canje entregado · ${item.establishment_name}`,
    points: -Math.abs(item.points),
    at: item.at,
  }));
  return [...earned, ...spent]
    .sort((left, right) => {
      if (left.at === right.at) return 0;
      return left.at < right.at ? 1 : -1;
    })
    .slice(0, 8);
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("es-MX", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
