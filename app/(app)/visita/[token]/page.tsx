"use client";

import { motion, useReducedMotion } from "framer-motion";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { readJsonSafely } from "src/lib/api/readJsonSafely";
import { markHivePending } from "src/lib/establishment/hiveArrivalStorage";
import { PRESENTATION_TOKEN_RE } from "src/lib/establishment/presentationToken";

type CheckIn = {
  establishment_id: string;
  establishment_name: string;
  already_today: boolean;
  first_visit: boolean;
};

type Outcome =
  | { ok: true; checkIn: CheckIn }
  | { ok: false; error: string; unauthorized?: boolean };

// El efecto corre dos veces en desarrollo (StrictMode): una sola petición por token.
const requests = new Map<string, Promise<Outcome>>();

function startCheckIn(token: string): Promise<Outcome> {
  const existing = requests.get(token);
  if (existing) return existing;
  const request = (async (): Promise<Outcome> => {
    const res = await fetch(`/api/visita/${encodeURIComponent(token)}`, {
      method: "POST",
      credentials: "include",
    });
    if (res.status === 401) {
      requests.delete(token);
      return { ok: false, error: "Necesitas iniciar sesión.", unauthorized: true };
    }
    const data = await readJsonSafely<
      { success: true; check_in: CheckIn } | { success: false; error?: string }
    >(res);
    if (!res.ok || !data?.success) {
      requests.delete(token);
      return {
        ok: false,
        error:
          data && "error" in data && data.error
            ? data.error
            : "No se pudo registrar la visita.",
      };
    }
    return { ok: true, checkIn: data.check_in };
  })().catch(() => {
    requests.delete(token);
    return { ok: false, error: "No se pudo registrar la visita." } as const;
  });
  requests.set(token, request);
  return request;
}

/** Destino del QR de presentación: registra la visita y salta al panal animado. */
export default function VisitaPage() {
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const params = useParams<{ token: string }>();
  const token = typeof params.token === "string" ? params.token : "";
  const valid = PRESENTATION_TOKEN_RE.test(token);
  const [outcome, setOutcome] = useState<Outcome | null>(
    valid ? null : { ok: false, error: "Este QR no es válido." }
  );
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!valid) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    void startCheckIn(token).then((result) => {
      if (cancelled) return;
      if (!result.ok && result.unauthorized) {
        router.replace(`/login?from=${encodeURIComponent(`/visita/${token}`)}`);
        return;
      }
      setOutcome(result);
      if (result.ok) {
        markHivePending({
          establishment_id: result.checkIn.establishment_id,
          via: "qr",
          already_today: result.checkIn.already_today,
        });
        const query = new URLSearchParams({
          nuevo: result.checkIn.establishment_id,
          via: "qr",
        });
        if (result.checkIn.already_today) query.set("hoy", "1");
        // Un respiro para leer el nombre antes de saltar al panal.
        timer = setTimeout(
          () => router.replace(`/negocios?${query.toString()}`),
          reduceMotion ? 300 : 1100
        );
      }
    });
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [router, token, valid, attempt, reduceMotion]);

  return (
    <main className="mx-auto flex min-h-[70svh] w-full max-w-lg items-center px-4 py-10">
      <section className="relative isolate w-full overflow-hidden rounded-[28px] bg-[#17130d] px-6 py-10 text-center text-tonki-chrome-text shadow-[0_30px_80px_-40px_rgba(0,0,0,0.9)]">
        <div className="tonki-hex-dark absolute inset-0 -z-10 opacity-40" />
        <div className="absolute left-1/2 top-1/3 -z-10 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-tonki-accent/25 blur-3xl" />

        {outcome === null || outcome.ok ? (
          <>
            <motion.div
              aria-hidden="true"
              className="tonki-hex-cell mx-auto h-24 w-[84px] bg-gradient-to-b from-[#ffe08a] via-tonki-accent to-[#d8961c] shadow-[0_0_40px_rgba(244,197,66,0.6)]"
              animate={
                reduceMotion
                  ? undefined
                  : outcome?.ok
                    ? { scale: [1, 1.25, 0.9], rotate: [0, 0, 60], opacity: [1, 1, 0.9] }
                    : { scale: [0.92, 1.05, 0.92], rotate: [0, 30, 60] }
              }
              transition={
                outcome?.ok
                  ? { duration: 0.9, ease: "easeInOut" }
                  : { duration: 1.6, repeat: Infinity, ease: "easeInOut" }
              }
            />
            <h1 className="mt-6 text-2xl font-bold tracking-tight" aria-live="polite">
              {outcome?.ok
                ? outcome.checkIn.already_today
                  ? `Ya estás en ${outcome.checkIn.establishment_name}`
                  : `¡Bienvenido a ${outcome.checkIn.establishment_name}!`
                : "Registrando tu visita…"}
            </h1>
            <p className="mt-2 text-sm text-tonki-chrome-text-muted">
              {outcome?.ok
                ? outcome.checkIn.already_today
                  ? "Tu visita de hoy ya contaba. Te llevamos a tu colmena."
                  : outcome.checkIn.first_visit
                    ? "Este lugar se suma a tu colmena."
                    : "Una visita más en tu colmena."
                : "Un momento."}
            </p>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-bold tracking-tight">No se registró la visita</h1>
            <p role="alert" className="mt-3 text-sm text-red-300">
              {outcome.error}
            </p>
            <div className="mt-6 flex flex-col items-center gap-3">
              {valid ? (
                <button
                  type="button"
                  onClick={() => {
                    requests.delete(token);
                    setOutcome(null);
                    setAttempt((value) => value + 1);
                  }}
                  className="rounded-full border border-white/15 px-5 py-2 text-sm font-semibold hover:bg-white/10"
                >
                  Reintentar
                </button>
              ) : null}
              <Link
                href="/negocios"
                className="text-sm font-semibold text-tonki-accent hover:underline"
              >
                Ver lugares
              </Link>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
