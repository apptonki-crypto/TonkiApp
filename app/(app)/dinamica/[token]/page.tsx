"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { readJsonSafely } from "src/lib/api/readJsonSafely";
import { readClaimResult } from "src/lib/posts/dynamicClient";

const CLAIM_TOKEN_RE = /^[A-Za-z0-9_-]{16,64}$/;

type ClaimOutcome =
  | { ok: true; message: string }
  | { ok: false; error: string; unauthorized?: boolean };

const claimRequests = new Map<string, Promise<ClaimOutcome>>();

function startClaim(token: string): Promise<ClaimOutcome> {
  const existing = claimRequests.get(token);
  if (existing) return existing;
  const request = (async (): Promise<ClaimOutcome> => {
    const res = await fetch(`/api/dynamics/claim/${encodeURIComponent(token)}`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    if (res.status === 401) {
      claimRequests.delete(token);
      return { ok: false, error: "Necesitas iniciar sesión.", unauthorized: true };
    }
    const data = await readJsonSafely(res);
    const result = readClaimResult(data, res.ok);
    if (!result.ok) {
      claimRequests.delete(token);
      return { ok: false, error: result.error };
    }
    return { ok: true, message: result.message };
  })().catch(() => {
    claimRequests.delete(token);
    return { ok: false, error: "No se pudo registrar la participación." } as const;
  });
  claimRequests.set(token, request);
  return request;
}

export default function DinamicaClaimPage() {
  const router = useRouter();
  const params = useParams<{ token: string }>();
  const token = typeof params.token === "string" ? params.token : "";
  const valid = CLAIM_TOKEN_RE.test(token);
  const [loading, setLoading] = useState(valid);
  const [outcome, setOutcome] = useState<ClaimOutcome | null>(
    valid ? null : { ok: false, error: "Este enlace no es válido." }
  );
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!valid) return;
    let cancelled = false;
    void startClaim(token).then((result) => {
      if (cancelled) return;
      if (result.ok === false && result.unauthorized) {
        router.replace(`/login?from=${encodeURIComponent(`/dinamica/${token}`)}`);
        return;
      }
      setOutcome(result);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [router, token, valid, attempt]);

  return (
    <main className="mx-auto w-full max-w-lg px-4 py-8 sm:px-6 sm:py-10">
      <section className="space-y-4 rounded-2xl border border-tonki-border bg-tonki-surface p-6 shadow-sm sm:p-8">
        <h1 className="text-2xl font-bold tracking-tight text-tonki-text">Dinámica</h1>
        {loading ? (
          <p className="text-sm text-tonki-text-muted">Registrando tu participación…</p>
        ) : outcome?.ok ? (
          <>
            <p className="text-sm text-tonki-text-secondary sm:text-base">{outcome.message}</p>
            <Link
              href="/dashboard"
              className="inline-flex rounded-full bg-tonki-accent px-5 py-2 text-sm font-bold text-tonki-accent-fg hover:bg-tonki-accent-hover"
            >
              Ir al inicio
            </Link>
          </>
        ) : (
          <>
            <p role="alert" className="text-sm text-tonki-danger">
              {outcome?.error ?? "No se pudo registrar la participación."}
            </p>
            {valid ? (
              <button
                type="button"
                onClick={() => {
                  claimRequests.delete(token);
                  setLoading(true);
                  setOutcome(null);
                  setAttempt((value) => value + 1);
                }}
                className="rounded-full border border-tonki-border px-4 py-2 text-sm font-semibold text-tonki-text-secondary hover:bg-tonki-surface-hover"
              >
                Reintentar
              </button>
            ) : null}
            <Link
              href="/dashboard"
              className="block text-sm font-semibold text-tonki-accent hover:underline"
            >
              Volver al inicio
            </Link>
          </>
        )}
      </section>
    </main>
  );
}
