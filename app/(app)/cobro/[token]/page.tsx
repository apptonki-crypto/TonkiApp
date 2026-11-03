"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { readJsonSafely } from "src/lib/api/readJsonSafely";
import type { ChargePreview } from "src/lib/charges/types";

type PreviewResponse =
  | { success: true; charge: ChargePreview }
  | { success: false; error?: string };

type ClaimResponse =
  | {
      success: true;
      message?: string;
      points: number;
      establishment_name: string;
      total_points: number;
    }
  | { success: false; error?: string };

function formatMoney(amount: string): string {
  const value = Number(amount);
  if (!Number.isFinite(value)) return amount;
  return value.toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
  });
}

export default function CobroPage() {
  const router = useRouter();
  const params = useParams<{ token: string }>();
  const token = typeof params.token === "string" ? params.token : "";
  const [loading, setLoading] = useState(true);
  const [charge, setCharge] = useState<ChargePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [credited, setCredited] = useState<{
    points: number;
    establishment_name: string;
    total_points: number;
  } | null>(null);

  const load = useCallback(async () => {
    if (!token) {
      setError("Este código no existe.");
      setLoading(false);
      return;
    }
    const res = await fetch(`/api/cobro/${encodeURIComponent(token)}`, {
      credentials: "include",
    });
    if (res.status === 401) {
      router.replace(`/login?from=${encodeURIComponent(`/cobro/${token}`)}`);
      return;
    }
    const data = await readJsonSafely<PreviewResponse>(res);
    if (!res.ok || !data?.success || !("charge" in data)) {
      setCharge(null);
      setError(
        data && "error" in data && data.error
          ? data.error
          : "No se pudo cargar el código"
      );
      setLoading(false);
      return;
    }
    setCharge(data.charge);
    setError(null);
    setLoading(false);
  }, [router, token]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await load();
      } catch {
        if (!cancelled) {
          setError("No se pudo cargar el código");
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  const handleClaim = useCallback(async () => {
    if (!token) return;
    setClaiming(true);
    setError(null);
    try {
      const res = await fetch(`/api/cobro/${encodeURIComponent(token)}`, {
        method: "POST",
        credentials: "include",
      });
      if (res.status === 401) {
        router.replace(`/login?from=${encodeURIComponent(`/cobro/${token}`)}`);
        return;
      }
      const data = await readJsonSafely<ClaimResponse>(res);
      if (!res.ok || !data?.success || !("points" in data)) {
        setError(
          data && "error" in data && data.error
            ? data.error
            : "No se pudieron acreditar los Tonkis"
        );
        await load();
        return;
      }
      setCredited({
        points: data.points,
        establishment_name: data.establishment_name,
        total_points: data.total_points,
      });
    } catch {
      setError("No se pudieron acreditar los Tonkis");
    } finally {
      setClaiming(false);
    }
  }, [load, router, token]);

  if (loading) {
    return (
      <main className="mx-auto w-full px-4 py-16 text-sm text-tonki-text-muted">
        Cargando Tonkis…
      </main>
    );
  }

  if (credited) {
    return (
      <main className="mx-auto w-full px-4 py-8 sm:px-6 sm:py-10">
        <section className="space-y-4 rounded-2xl border border-tonki-border bg-tonki-surface p-6 shadow-sm sm:p-8">
          <h1 className="text-2xl font-bold tracking-tight text-tonki-text">
            Se acreditaron {credited.points.toLocaleString("es-MX")} Tonkis
          </h1>
          <p className="text-sm text-tonki-text-secondary sm:text-base">
            {credited.establishment_name} sumó estos Tonkis a tu perfil. No se
            realizó ningún pago.
          </p>
          <p className="text-sm font-semibold text-tonki-text">
            Tu saldo: {credited.total_points.toLocaleString("es-MX")} Tonkis
          </p>
          <Link
            href="/account"
            className="block w-full rounded-xl bg-tonki-accent px-4 py-3 text-center text-base font-bold text-tonki-accent-fg transition-colors hover:bg-tonki-accent-hover"
          >
            Ver tu perfil
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full px-4 py-8 sm:px-6 sm:py-10">
      <h1 className="text-2xl font-bold tracking-tight text-tonki-text sm:text-3xl">
        Tonkis por tu consumo
      </h1>

      {error ? (
        <p
          role="alert"
          className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-tonki-danger"
        >
          {error}
        </p>
      ) : null}

      {charge ? (
        <section className="mt-8 space-y-5 rounded-2xl border border-tonki-border bg-tonki-surface p-6 shadow-sm sm:p-8">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-tonki-border bg-tonki-canvas text-sm font-semibold text-tonki-text-muted">
              {charge.establishment_avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={charge.establishment_avatar_url}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                charge.establishment_name.trim().charAt(0).toUpperCase()
              )}
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-tonki-text-faint">
                Negocio
              </p>
              <p className="text-lg font-bold text-tonki-text">
                {charge.establishment_name}
              </p>
            </div>
          </div>

          <p className="text-base text-tonki-text-secondary">
            {charge.can_claim ? (
              <>
                Vas a recibir{" "}
                <span className="font-bold text-tonki-text">
                  {charge.points.toLocaleString("es-MX")} Tonkis
                </span>{" "}
                de {charge.establishment_name}. El monto de referencia es{" "}
                {formatMoney(charge.amount)} ({charge.cashback_percent}%). No se
                cobra ni se mueve dinero.
              </>
            ) : (
              <>
                {charge.establishment_name}. Monto de referencia:{" "}
                {formatMoney(charge.amount)} ({charge.cashback_percent}%). No se
                cobra ni se mueve dinero.
              </>
            )}
          </p>

          {charge.block_reason ? (
            <p className="rounded-xl border border-tonki-border bg-tonki-canvas px-4 py-3 text-sm text-tonki-text-secondary">
              {charge.block_reason}
            </p>
          ) : null}

          {charge.can_claim ? (
            <button
              type="button"
              disabled={claiming}
              onClick={() => void handleClaim()}
              className="w-full rounded-xl bg-tonki-accent px-4 py-3 text-base font-bold text-tonki-accent-fg transition-colors hover:bg-tonki-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
            >
              {claiming ? "Acreditando…" : "Recibir Tonkis"}
            </button>
          ) : null}
        </section>
      ) : null}
    </main>
  );
}
