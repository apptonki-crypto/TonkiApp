"use client";

import { usePollar } from "@pollar/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { readJsonSafely } from "src/lib/api/readJsonSafely";
import type { PaymentIntent } from "src/lib/charges/types";

import { RampLoadCard } from "./RampLoadCard";

export type CreditedResult = {
  points: number;
  establishment_name: string;
  total_points: number;
};

type SettleBody =
  | ({ success: true; message?: string } & CreditedResult)
  | { success: false; error?: string; retry?: boolean };

type IntentBody =
  | { success: true; intent: PaymentIntent }
  | { success: false; error?: string };

type Props = {
  token: string;
  pesosLabel: string;
  /** The customer already locked a payment on this charge (reload or retry). */
  resuming: boolean;
  /** awaiting | confirmed | null, as stored on the charge. */
  payStatus: string | null;
  /** Pollar ramp order stored on the charge for this customer, to resume it. */
  rampOrderId: string | null;
  onCredited: (result: CreditedResult) => void;
  onError: (message: string) => void;
};

const SETTLE_ATTEMPTS = 24;
const SETTLE_DELAY_MS = 2500;

function hashKey(token: string): string {
  return `tonki:cobro-tx:${token}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readStoredHash(token: string): string | null {
  try {
    return window.sessionStorage.getItem(hashKey(token));
  } catch {
    return null;
  }
}

function storeHash(token: string, hash: string): void {
  try {
    window.sessionStorage.setItem(hashKey(token), hash);
  } catch {
    // The hash only enables resume after a reload.
  }
}

function clearHash(token: string): void {
  try {
    window.sessionStorage.removeItem(hashKey(token));
  } catch {
    // Nothing to clear.
  }
}

/**
 * Pays a charge from the customer's Pollar wallet with `sendPayment`. When the
 * wallet has no balance, a ramp order loads pesos into that same wallet first
 * (see `RampLoadCard`); the payment itself is always confirmed by the customer.
 * Tonkis are credited by the server once the Stellar transfer is verified,
 * never by this component.
 */
export function PollarPayActions({
  token,
  pesosLabel,
  resuming,
  payStatus,
  rampOrderId,
  onCredited,
  onError,
}: Props) {
  const router = useRouter();
  const { sendPayment, isAuthenticated, verified } = usePollar();
  const [busy, setBusy] = useState<
    "preparing" | "sending" | "confirming" | null
  >(null);
  const [intent, setIntent] = useState<PaymentIntent | null>(null);
  const [storedHash, setStoredHash] = useState<string | null>(null);
  const [rampActive, setRampActive] = useState(false);
  const [funded, setFunded] = useState(false);
  const resumed = useRef(false);

  const loginHref = `/login?from=${encodeURIComponent(`/cobro/${token}`)}`;
  const signedIn = isAuthenticated && verified;

  const settle = useCallback(
    async (hash: string): Promise<void> => {
      setBusy("confirming");
      try {
        for (let attempt = 0; attempt < SETTLE_ATTEMPTS; attempt += 1) {
          const res = await fetch(`/api/cobro/${encodeURIComponent(token)}`, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tx_hash: hash }),
          });
          if (res.status === 401) {
            router.replace(loginHref);
            return;
          }
          const data = await readJsonSafely<SettleBody>(res);
          if (res.status === 202) {
            await sleep(SETTLE_DELAY_MS);
            continue;
          }
          if (res.ok && data?.success && "points" in data) {
            clearHash(token);
            setStoredHash(null);
            onCredited({
              points: data.points,
              establishment_name: data.establishment_name,
              total_points: data.total_points,
            });
            return;
          }
          onError(
            data && "error" in data && data.error
              ? data.error
              : "No se pudo confirmar el pago."
          );
          return;
        }
        onError(
          "La red tarda en confirmar. Tu transferencia ya salió: toca Verificar pago en unos segundos."
        );
      } catch {
        onError("No se pudo confirmar el pago.");
      } finally {
        setBusy(null);
      }
    },
    [loginHref, onCredited, onError, router, token]
  );

  useEffect(() => {
    if (resumed.current) return;
    resumed.current = true;
    const hash = readStoredHash(token);
    if (hash) setStoredHash(hash);
    if (!resuming) return;
    // Payment already verified: only the Tonkis credit is missing, no hash needed.
    if (payStatus === "confirmed") void settle(hash ?? "");
    else if (hash) void settle(hash);
  }, [payStatus, resuming, settle, token]);

  /** Freezes asset, amount, destination and memo on the server (idempotent per payer). */
  const lockIntent = useCallback(async (): Promise<PaymentIntent | null> => {
    const res = await fetch(`/api/cobro/${encodeURIComponent(token)}/intent`, {
      method: "POST",
      credentials: "include",
    });
    if (res.status === 401) {
      router.replace(loginHref);
      return null;
    }
    const data = await readJsonSafely<IntentBody>(res);
    if (!res.ok || !data?.success || !("intent" in data)) {
      onError(
        data && "error" in data && data.error
          ? data.error
          : "No se pudo preparar el pago."
      );
      return null;
    }
    setIntent(data.intent);
    return data.intent;
  }, [loginHref, onError, router, token]);

  const ensureRampIntent = useCallback(async () => {
    try {
      return await lockIntent();
    } catch {
      onError("No se pudo preparar el pago.");
      return null;
    }
  }, [lockIntent, onError]);

  const payFromWallet = useCallback(async () => {
    setBusy("preparing");
    try {
      const locked = await lockIntent();
      if (!locked) {
        setBusy(null);
        return;
      }

      setBusy("sending");
      const outcome = await sendPayment({
        destination: locked.destination,
        amount: locked.amount,
        asset: locked.asset,
        options: { memo: { type: "text", value: locked.memo } },
      });

      if (outcome.status === "success" || outcome.status === "pending") {
        storeHash(token, outcome.hash);
        setStoredHash(outcome.hash);
        await settle(outcome.hash);
        return;
      }
      onError(
        outcome.status === "cosign_pending"
          ? "Aprueba la transferencia en tu dispositivo y vuelve a intentar."
          : outcome.status === "error" && outcome.details
            ? outcome.details
            : "No se pudo enviar el pago."
      );
      setBusy(null);
    } catch {
      onError("No se pudo enviar el pago.");
      setBusy(null);
    }
  }, [lockIntent, onError, sendPayment, settle, token]);

  if (!signedIn) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-tonki-text-secondary">
          Para pagar necesitas tu sesión de Pollar en este dispositivo.
        </p>
        <Link
          href={loginHref}
          className="block w-full rounded-xl bg-tonki-accent px-4 py-3 text-center text-base font-bold text-tonki-accent-fg transition-colors hover:bg-tonki-accent-hover"
        >
          Iniciar sesión con Pollar
        </Link>
      </div>
    );
  }

  const label =
    busy === "preparing"
      ? "Preparando pago…"
      : busy === "sending"
        ? "Enviando desde tu wallet…"
        : busy === "confirming"
          ? "Confirmando en la red…"
          : "Pagar con mi wallet";

  return (
    <div className="space-y-3">
      <button
        type="button"
        disabled={busy !== null || rampActive}
        onClick={() => void payFromWallet()}
        className="w-full rounded-xl bg-tonki-accent px-4 py-3 text-base font-bold text-tonki-accent-fg transition-colors hover:bg-tonki-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
      >
        {label}
      </button>

      {intent ? (
        <p className="text-xs text-tonki-text-muted">
          Se envían {intent.amount} {intent.asset_code} (1 {intent.asset_code} ≈
          ${intent.rate_mxn} MXN) a la wallet del negocio.
        </p>
      ) : null}

      {storedHash && busy === null ? (
        <button
          type="button"
          onClick={() => void settle(storedHash)}
          className="w-full rounded-xl border border-tonki-border px-4 py-3 text-sm font-semibold text-tonki-text transition-colors hover:bg-tonki-canvas"
        >
          Verificar pago
        </button>
      ) : null}

      {funded ? (
        <p className="rounded-xl border border-tonki-border bg-tonki-canvas px-4 py-3 text-sm text-tonki-text-secondary">
          Tu saldo ya está cargado. Toca Pagar con mi wallet para enviar el
          pago al negocio.
        </p>
      ) : null}

      <RampLoadCard
        token={token}
        pesosLabel={pesosLabel}
        initialOrderId={rampOrderId}
        disabled={busy !== null}
        ensureIntent={ensureRampIntent}
        onActiveChange={setRampActive}
        onFunded={() => setFunded(true)}
      />
    </div>
  );
}
