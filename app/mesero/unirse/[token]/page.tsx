"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import {
  previewStaffInviteClient,
  redeemStaffInviteClient,
} from "src/lib/staff/fetchStaffClient";
import { isStaffInviteToken } from "src/lib/staff/constants";

/**
 * Enlace que comparte el negocio. El middleware ya pidió iniciar sesión;
 * aquí el cliente confirma y su cuenta pasa a ser de mesero.
 */
export default function UnirseComoMeseroPage() {
  const params = useParams<{ token: string }>();
  const token = typeof params.token === "string" ? params.token : "";
  const validToken = isStaffInviteToken(token);
  const router = useRouter();
  const [establishment, setEstablishment] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(validToken);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!validToken) return;
    let cancelled = false;
    void previewStaffInviteClient(token).then((result) => {
      if (cancelled) return;
      if (result.ok) setEstablishment(result.data.establishment_name);
      else setError(result.error);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [token, validToken]);

  async function accept() {
    setBusy(true);
    setError(null);
    const result = await redeemStaffInviteClient(token);
    if (!result.ok) {
      setError(result.error);
      setBusy(false);
      return;
    }
    router.replace(result.data.redirectTo);
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-tonki-canvas px-4 py-10 text-tonki-text">
      <section className="w-full max-w-md space-y-5 rounded-2xl border border-tonki-border bg-tonki-surface p-6 shadow-sm">
        <h1 className="text-xl font-bold tracking-tight">Invitación de mesero</h1>

        {loading ? (
          <p className="text-sm text-tonki-text-muted">Revisando invitación…</p>
        ) : establishment ? (
          <>
            <p className="text-sm text-tonki-text-secondary">
              <span className="font-semibold text-tonki-text">{establishment}</span> te invita a
              cobrar como mesero.
            </p>
            <ul className="list-disc space-y-1 pl-5 text-sm text-tonki-text-secondary">
              <li>Podrás generar QR de cobro a nombre del negocio.</li>
              <li>
                Mientras seas mesero, esta cuenta no podrá ganar ni ver Tonkis como cliente.
              </li>
              <li>El negocio puede darte de baja cuando quiera.</li>
            </ul>
            {error ? (
              <p role="alert" className="text-sm text-tonki-danger">
                {error}
              </p>
            ) : null}
            <button
              type="button"
              onClick={() => void accept()}
              disabled={busy}
              className="w-full rounded-xl bg-tonki-accent px-4 py-3 text-sm font-bold text-tonki-accent-fg transition-colors hover:bg-tonki-accent-hover disabled:opacity-50"
            >
              {busy ? "Uniéndome…" : `Unirme a ${establishment}`}
            </button>
          </>
        ) : (
          <>
            <p role="alert" className="text-sm text-tonki-danger">
              {!validToken
                ? "Este enlace de invitación no es válido."
                : (error ?? "No se pudo revisar la invitación.")}
            </p>
            <Link href="/dashboard" className="inline-flex text-sm font-semibold text-tonki-accent">
              Ir al inicio
            </Link>
          </>
        )}
      </section>
    </main>
  );
}
