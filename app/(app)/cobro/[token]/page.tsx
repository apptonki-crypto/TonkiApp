"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { usePollarReady } from "src/components/PollarAppProvider";
import { readJsonSafely } from "src/lib/api/readJsonSafely";
import { markHivePending } from "src/lib/establishment/hiveArrivalStorage";
import type { ChargePreview } from "src/lib/charges/types";

import { PollarPayActions, type CreditedResult } from "./PollarPayActions";

type PreviewResponse =
  | { success: true; charge: ChargePreview }
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
  const pollarReady = usePollarReady();
  const [credited, setCredited] = useState<CreditedResult | null>(null);

  // El consumo también suma al panal: Lugares muestra un punto hasta que se abra.
  const establishmentId = charge?.establishment_id ?? null;
  useEffect(() => {
    if (credited && establishmentId) {
      markHivePending({ establishment_id: establishmentId, via: "consumo" });
    }
  }, [credited, establishmentId]);

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

  const handleError = useCallback(
    (message: string) => {
      setError(message);
      void load().catch(() => undefined);
    },
    [load]
  );

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
            Tu pago a {credited.establishment_name} se confirmó y los Tonkis ya
            están en tu perfil.
          </p>
          <p className="text-sm font-semibold text-tonki-text">
            Tu saldo: {credited.total_points.toLocaleString("es-MX")} Tonkis
          </p>
          {charge ? (
            <Link
              href={`/negocios?nuevo=${encodeURIComponent(charge.establishment_id)}&via=consumo`}
              className="block w-full rounded-xl bg-tonki-accent px-4 py-3 text-center text-base font-bold text-tonki-accent-fg transition-colors hover:bg-tonki-accent-hover"
            >
              Ver tu colmena
            </Link>
          ) : null}
          <Link
            href="/account"
            className="block w-full rounded-xl border border-tonki-border px-4 py-3 text-center text-base font-semibold text-tonki-text-secondary transition-colors hover:bg-tonki-surface-hover"
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
                Pagas{" "}
                <span className="font-bold text-tonki-text">
                  {formatMoney(charge.amount)}
                </span>{" "}
                a {charge.establishment_name} desde tu wallet y recibes{" "}
                <span className="font-bold text-tonki-text">
                  {charge.points.toLocaleString("es-MX")} Tonkis
                </span>{" "}
                ({charge.cashback_percent}%).
              </>
            ) : (
              <>
                {charge.establishment_name}. Total: {formatMoney(charge.amount)}{" "}
                ({charge.cashback_percent}%).
              </>
            )}
          </p>

          {charge.block_reason ? (
            <p className="rounded-xl border border-tonki-border bg-tonki-canvas px-4 py-3 text-sm text-tonki-text-secondary">
              {charge.block_reason}
            </p>
          ) : null}

          {charge.can_claim ? (
            pollarReady ? (
              <PollarPayActions
                token={token}
                pesosLabel={charge.amount}
                resuming={charge.payer_is_viewer && charge.pay_status !== null}
                payStatus={charge.pay_status}
                rampOrderId={charge.ramp_order_id}
                onCredited={setCredited}
                onError={handleError}
              />
            ) : (
              <p className="rounded-xl border border-tonki-border bg-tonki-canvas px-4 py-3 text-sm text-tonki-text-secondary">
                El pago con Pollar no está disponible en este momento.
              </p>
            )
          ) : null}
        </section>
      ) : null}
    </main>
  );
}
