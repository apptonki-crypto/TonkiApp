"use client";

import { useEffect, useState } from "react";

import {
  fetchPresentationQr,
  type PresentationQr,
} from "src/lib/establishment/fetchPresentationClient";

const BUTTON =
  "inline-flex items-center justify-center rounded-xl bg-tonki-accent px-4 py-3 text-sm font-bold text-tonki-accent-fg transition-colors hover:bg-tonki-accent-hover disabled:opacity-50";
const SECONDARY =
  "inline-flex items-center justify-center rounded-xl border border-tonki-border px-4 py-3 text-sm font-semibold text-tonki-text-secondary transition-colors hover:bg-tonki-surface-hover disabled:opacity-50";

const TONKI_MARK = "/Logos-Tonki-SVG/Isotipo caf-amarillo.svg";

function fileNameFor(name: string): string {
  const slug = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `qr-presentacion-${slug || "negocio"}.png`;
}

export default function PresentacionPage() {
  const [qr, setQr] = useState<PresentationQr | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rotating, setRotating] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetchPresentationQr().then((result) => {
      if (cancelled) return;
      if (result.ok) setQr(result.presentation);
      else setError(result.error);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function rotate() {
    const sure = window.confirm(
      "Se generará un QR nuevo y el actual dejará de funcionar, incluido el que ya imprimiste. ¿Continuar?"
    );
    if (!sure) return;
    setRotating(true);
    setCopied(false);
    const result = await fetchPresentationQr("POST");
    if (result.ok) {
      setQr(result.presentation);
      setError(null);
    } else {
      setError(result.error);
    }
    setRotating(false);
  }

  async function copyLink() {
    if (!qr) return;
    try {
      await navigator.clipboard.writeText(qr.url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 sm:py-10 print:max-w-none print:p-0">
      <div className="print:hidden">
        <h1 className="text-2xl font-bold tracking-tight text-tonki-text sm:text-3xl">
          QR de presentación
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-tonki-text-muted sm:text-base">
          Pégalo en tu mostrador o en la mesa. Cuando un cliente lo escanea, tu
          negocio se enciende en su colmena de Lugares y suma una visita al día.
          No mueve dinero ni da Tonkis: para eso está el QR de consumo.
        </p>
      </div>

      {loading ? (
        <p className="mt-8 text-sm text-tonki-text-muted">Cargando QR…</p>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="mt-8 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-tonki-danger print:hidden"
        >
          {error}
        </p>
      ) : null}

      {qr ? (
        <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_260px] print:mt-0 print:block">
          <PresentationPoster qr={qr} />

          <aside className="flex flex-col gap-3 print:hidden">
            <a href={qr.qr_image} download={fileNameFor(qr.establishment_name)} className={BUTTON}>
              Descargar imagen del QR
            </a>
            <button type="button" onClick={() => window.print()} className={SECONDARY}>
              Imprimir cartel
            </button>
            <button type="button" onClick={copyLink} className={SECONDARY}>
              {copied ? "Enlace copiado" : "Copiar enlace"}
            </button>
            <p className="break-all rounded-xl bg-tonki-surface-hover/60 px-3 py-2 text-xs text-tonki-text-muted">
              {qr.url}
            </p>

            <div className="mt-4 border-t border-tonki-border pt-4">
              <p className="text-sm font-semibold text-tonki-text">¿Alguien lo copió?</p>
              <p className="mt-1 text-xs text-tonki-text-muted">
                Si el código circula fuera de tu local, genera uno nuevo. El anterior
                deja de funcionar al instante.
              </p>
              <button
                type="button"
                onClick={rotate}
                disabled={rotating}
                className="mt-3 text-sm font-semibold text-tonki-danger transition-opacity hover:opacity-80 disabled:opacity-50"
              >
                {rotating ? "Generando…" : "Generar QR nuevo"}
              </button>
            </div>
          </aside>
        </div>
      ) : null}
    </main>
  );
}

/** Cartel imprimible: lo mismo que se ve en pantalla sale en papel. */
function PresentationPoster({ qr }: { qr: PresentationQr }) {
  return (
    <section
      aria-label={`Cartel de ${qr.establishment_name}`}
      className="relative isolate mx-auto w-full max-w-md overflow-hidden rounded-[32px] bg-[#fefdf5] px-8 pb-8 pt-10 text-center text-[#2d210d] shadow-[0_30px_80px_-40px_rgba(45,33,13,0.6)] ring-1 ring-[#2d210d]/10 [print-color-adjust:exact] print:max-w-none print:rounded-none print:shadow-none print:ring-0"
    >
      <div className="tonki-hex-light absolute inset-0 -z-10 opacity-70" />
      <div className="absolute -right-16 -top-16 -z-10 h-56 w-56 rounded-full bg-[#f4c542]/45 blur-3xl" />
      <div className="absolute -bottom-20 -left-12 -z-10 h-56 w-56 rounded-full bg-[#f4c542]/30 blur-3xl" />

      <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#b07d12]">
        Estás en
      </p>
      <h2 className="mt-1 text-3xl font-extrabold leading-tight tracking-tight">
        {qr.establishment_name}
      </h2>

      <div className="relative mx-auto mt-6 w-full max-w-[300px]">
        <div className="tonki-hex-cell absolute -inset-6 -z-10 bg-gradient-to-b from-[#ffe08a] via-[#f4c542] to-[#d8961c]" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={qr.qr_image}
          alt={`QR de presentación de ${qr.establishment_name}`}
          className="w-full rounded-2xl bg-[#fefdf5] p-3 shadow-[0_10px_30px_-10px_rgba(45,33,13,0.5)]"
        />
      </div>

      <p className="mt-10 text-xl font-bold">Escanéame y suma este lugar a tu colmena</p>
      <ol className="mx-auto mt-4 flex max-w-sm flex-col gap-2 text-left text-sm">
        {[
          "Abre la cámara de tu celular.",
          "Apunta al código y toca el enlace.",
          "Mira cómo se enciende una celda en tu panal de Tonki.",
        ].map((step, index) => (
          <li key={step} className="flex items-start gap-3">
            <span className="tonki-hex-cell flex h-7 w-6 shrink-0 items-center justify-center bg-[#2d210d] text-xs font-bold text-[#f4c542]">
              {index + 1}
            </span>
            <span className="pt-1">{step}</span>
          </li>
        ))}
      </ol>

      <div className="mt-8 flex items-center justify-center gap-2 text-sm font-bold">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={TONKI_MARK} alt="" width={28} height={28} className="h-7 w-7" />
        Tonki
      </div>
    </section>
  );
}
