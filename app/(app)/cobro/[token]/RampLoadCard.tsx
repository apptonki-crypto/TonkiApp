"use client";

import { usePollar } from "@pollar/react";
import {
  assertRampStellarSigner,
  isPollarApiError,
  rampFieldError,
  rampFieldValid,
  rampQuoteFields,
  type RampOrder,
  type RampQuote,
  type RampQuoteRejection,
} from "@pollar/core";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  buildQuoteRequest,
  describeNoQuote,
  describeRampOrder,
  formatPesos,
  isRampOrderFinal,
  missingOnrampRouteMessage,
  pickOnrampRoute,
  quoteCoversAmount,
  rampErrorText,
  rampStateToStore,
  type NoQuoteView,
} from "src/lib/charges/settlement/ramp";
import { readPollarNetwork } from "src/lib/auth/pollarPublicConfig";
import type { PaymentIntent } from "src/lib/charges/types";

type Props = {
  token: string;
  /** Ticket total in pesos, as the charge stores it. */
  pesosLabel: string;
  /** Pollar ramp order stored on the charge for this customer, if any. */
  initialOrderId: string | null;
  /** Another action of the card (paying, confirming) is running. */
  disabled: boolean;
  /** Locks and returns the payment intent, or null after reporting why not. */
  ensureIntent: () => Promise<PaymentIntent | null>;
  /** True while a ramp step runs and the wallet payment should wait. */
  onActiveChange: (active: boolean) => void;
  /** The order completed and the wallet balance was refreshed. */
  onFunded: () => void;
};

type Step = "idle" | "preparing" | "quoted" | "ordering" | "following";

const BUTTON_PRIMARY =
  "w-full rounded-xl bg-tonki-accent px-4 py-3 text-sm font-bold text-tonki-accent-fg transition-colors hover:bg-tonki-accent-hover disabled:cursor-not-allowed disabled:opacity-60";
const BUTTON_SECONDARY =
  "w-full rounded-xl border border-tonki-border px-4 py-3 text-sm font-semibold text-tonki-text transition-colors hover:bg-tonki-surface disabled:cursor-not-allowed disabled:opacity-60";
const FIELD =
  "w-full rounded-xl border border-tonki-border bg-tonki-surface px-4 py-3 text-sm text-tonki-text outline-none transition-colors focus:border-tonki-accent";

function scannableSrc(image: {
  mediaType: string;
  encoding: string;
  data: string;
}): string {
  return image.encoding === "base64"
    ? `data:${image.mediaType};base64,${image.data}`
    : `data:${image.mediaType};charset=utf-8,${encodeURIComponent(image.data)}`;
}

function isAbort(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name?: unknown }).name === "AbortError"
  );
}

/**
 * Loads pesos into the customer's own Pollar wallet with a ramp order, inside
 * the cobro card. The money lands in their wallet, never the business's; the
 * customer still confirms the payment with the wallet button afterwards.
 */
export function RampLoadCard({
  token,
  pesosLabel,
  initialOrderId,
  disabled,
  ensureIntent,
  onActiveChange,
  onFunded,
}: Props) {
  const { getClient, openKycModal, openCosignModal, refreshWalletBalance, setTrustline } =
    usePollar();

  const [step, setStep] = useState<Step>("idle");
  const [note, setNote] = useState<string | null>(null);
  const [noQuote, setNoQuote] = useState<NoQuoteView | null>(null);
  const [quote, setQuote] = useState<RampQuote | null>(null);
  const [quoteIntent, setQuoteIntent] = useState<PaymentIntent | null>(null);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [order, setOrder] = useState<RampOrder | null>(null);
  const [orderId, setOrderId] = useState<string | null>(initialOrderId);
  const [paused, setPaused] = useState(false);
  const [working, setWorking] = useState(false);
  const [pollTrouble, setPollTrouble] = useState(false);

  const mounted = useRef(true);
  const inFlight = useRef(false);
  const pollAbort = useRef<AbortController | null>(null);
  const lastPersisted = useRef<string | null>(null);
  const completedFor = useRef<string | null>(null);
  const latest = useRef({
    getClient,
    refreshWalletBalance,
    onFunded,
    onActiveChange,
  });
  useEffect(() => {
    latest.current = { getClient, refreshWalletBalance, onFunded, onActiveChange };
  });

  const persist = useCallback(
    (next: RampOrder) => {
      const state = rampStateToStore(next);
      const key = `${next.id}:${state}`;
      if (lastPersisted.current === key) return;
      lastPersisted.current = key;
      void fetch(`/api/cobro/${encodeURIComponent(token)}/ramp`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_id: next.id, state }),
      }).catch(() => undefined);
    },
    [token]
  );

  const apply = useCallback(
    (next: RampOrder) => {
      if (!mounted.current) return;
      setOrder(next);
      setOrderId(next.id);
      setPollTrouble(false);
      persist(next);
      if (next.state === "completed" && completedFor.current !== next.id) {
        completedFor.current = next.id;
        void (async () => {
          try {
            await latest.current.refreshWalletBalance();
          } catch {
            // The wallet button works with whatever balance Pollar reports.
          }
          if (mounted.current) latest.current.onFunded();
        })();
      }
    },
    [persist]
  );

  const follow = useCallback(
    async (id: string, first?: RampOrder) => {
      pollAbort.current?.abort();
      const controller = new AbortController();
      pollAbort.current = controller;
      setStep("following");
      setPaused(false);
      if (first) apply(first);
      try {
        const last = await latest.current.getClient().pollRampOrder(id, {
          signal: controller.signal,
          onUpdate: (next) => {
            if (!controller.signal.aborted) apply(next);
          },
          onError: () => {
            if (!controller.signal.aborted && mounted.current) setPollTrouble(true);
          },
        });
        if (!controller.signal.aborted) apply(last);
      } catch (error) {
        if (controller.signal.aborted || isAbort(error)) return;
        if (mounted.current) {
          setNote(rampErrorText(error, "No pudimos seguir tu carga. Revisa el estado."));
        }
      }
    },
    [apply]
  );

  const resume = useCallback(
    async (id: string) => {
      setStep("following");
      setNote(null);
      setWorking(true);
      try {
        const existing = await latest.current.getClient().getRampOrder(id);
        if (!mounted.current) return;
        setWorking(false);
        await follow(id, existing);
      } catch (error) {
        if (!mounted.current) return;
        setWorking(false);
        const missing = isPollarApiError(error) && error.code === "SDK_RAMPS_TX_NOT_FOUND";
        setNote(
          missing
            ? "No encontramos tu carga anterior. Puedes iniciar una nueva."
            : rampErrorText(error, "No pudimos retomar tu carga. Intenta de nuevo.")
        );
        setStep("idle");
        if (missing) setOrderId(null);
      }
    },
    [follow]
  );

  useEffect(() => {
    mounted.current = true;
    if (initialOrderId) void resume(initialOrderId);
    return () => {
      mounted.current = false;
      pollAbort.current?.abort();
    };
    // Resume only when the card mounts; later order changes come from handlers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const view = order ? describeRampOrder(order) : null;
  const finished = order ? isRampOrderFinal(order.state) : false;
  const active =
    step === "preparing" ||
    step === "ordering" ||
    (step === "following" && !paused && !finished && order !== null);

  useEffect(() => {
    latest.current.onActiveChange(active);
  }, [active]);

  const reset = useCallback(() => {
    pollAbort.current?.abort();
    setStep("idle");
    setOrder(null);
    setQuote(null);
    setNoQuote(null);
    setNote(null);
    setFieldValues({});
    setPaused(false);
  }, []);

  const startQuote = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setStep("preparing");
    setNote(null);
    setNoQuote(null);
    setQuote(null);
    try {
      const intent = await ensureIntent();
      if (!intent) {
        if (mounted.current) setStep("idle");
        return;
      }
      const client = latest.current.getClient();
      const { routes } = await client.getRampRoutes("ONRAMP");
      const route = pickOnrampRoute(routes, intent);
      if (!route) {
        if (!mounted.current) return;
        setNoQuote({
          kind: "text",
          message: missingOnrampRouteMessage(
            routes,
            intent,
            readPollarNetwork()
          ),
        });
        setStep("idle");
        return;
      }

      let quotes: RampQuote[] = [];
      let rejected: RampQuoteRejection[] = [];
      try {
        const result = await client.quoteRamp(buildQuoteRequest(route, intent));
        quotes = result.quotes;
        rejected = result.rejected;
      } catch (error) {
        if (isPollarApiError(error) && error.code === "SDK_RAMPS_NO_ROUTE") {
          const body = error.body.rejected;
          rejected = Array.isArray(body) ? (body as RampQuoteRejection[]) : [];
        } else {
          throw error;
        }
      }
      if (!mounted.current) return;

      const best = quotes[0];
      if (!best) {
        setNoQuote(
          rejected.length > 0
            ? describeNoQuote(rejected)
            : {
                kind: "text",
                message:
                  "No hay cotización disponible para este monto. Paga con el saldo de tu wallet.",
              }
        );
        setStep("idle");
        return;
      }
      if (!quoteCoversAmount(best.amountOut, intent.amount)) {
        setNoQuote({
          kind: "text",
          message:
            "La cotización no alcanza para cubrir el pago. Intenta de nuevo en un momento.",
        });
        setStep("idle");
        return;
      }
      setQuote(best);
      setQuoteIntent(intent);
      setFieldValues({});
      setStep("quoted");
    } catch (error) {
      if (!mounted.current) return;
      setNote(rampErrorText(error, "No pudimos cotizar la carga. Intenta de nuevo."));
      setStep("idle");
    } finally {
      inFlight.current = false;
    }
  }, [ensureIntent]);

  const submitOrder = useCallback(async () => {
    if (inFlight.current || !quote) return;
    const fields = rampQuoteFields(quote);
    if (!fields.every((field) => rampFieldValid(field, fieldValues[field.key]))) {
      setNote("Completa tus datos para continuar.");
      return;
    }
    if (Date.parse(quote.expiresAt) <= Date.now()) {
      setNote("La cotización venció. Cotizamos de nuevo.");
      void startQuote();
      return;
    }
    inFlight.current = true;
    setStep("ordering");
    setNote(null);
    try {
      const payee: Record<string, string> = {};
      for (const field of fields) {
        const value = fieldValues[field.key]?.trim();
        if (value) payee[field.key] = value;
      }
      // The same quote always answers the same order, so a retry cannot charge twice.
      const created = await latest.current
        .getClient()
        .createRampOrder({ quoteId: quote.quoteId, payee });
      inFlight.current = false;
      if (!mounted.current) return;
      setQuote(null);
      await follow(created.id, created);
    } catch (error) {
      inFlight.current = false;
      if (!mounted.current) return;
      setNote(rampErrorText(error, "No pudimos crear la orden. Intenta de nuevo."));
      setStep("quoted");
    }
  }, [fieldValues, follow, quote, startQuote]);

  const refreshOrder = useCallback(
    async (check: boolean) => {
      if (inFlight.current || !orderId) return;
      inFlight.current = true;
      setWorking(true);
      setNote(null);
      try {
        const client = latest.current.getClient();
        const next = check
          ? await client.checkRampOrder(orderId)
          : await client.getRampOrder(orderId);
        inFlight.current = false;
        if (!mounted.current) return;
        setWorking(false);
        await follow(orderId, next);
      } catch (error) {
        inFlight.current = false;
        if (!mounted.current) return;
        setWorking(false);
        setNote(rampErrorText(error, "No pudimos revisar tu carga. Intenta de nuevo."));
      }
    },
    [follow, orderId]
  );

  const authorize = useCallback(async () => {
    if (inFlight.current || !order || !view?.actionId) return;
    inFlight.current = true;
    setWorking(true);
    setNote(null);
    const client = latest.current.getClient();
    let release: () => void = () => undefined;
    try {
      // The signer lives only for this explicit Authorize, never in the background.
      release = client.registerRampSigningHandler("STELLAR", "xdr", async (action) => {
        const wallet = client.getWallet();
        if (!wallet) throw new Error("Conecta la wallet para firmar.");
        assertRampStellarSigner(action, wallet.address);
        const outcome = await client.signTx(action.payload.value);
        if (client.getWallet()?.address !== wallet.address) {
          throw new Error("La wallet cambió. Revisa e intenta de nuevo.");
        }
        if (outcome.status === "signed") return outcome.signedXdr;
        throw new Error("Se canceló la firma.");
      });
    } catch {
      // Another signer is already registered (for example Pollar's own modal).
    }
    try {
      const next = await client.signRampLeg(order.id, view.actionId);
      inFlight.current = false;
      if (!mounted.current) return;
      setWorking(false);
      await follow(order.id, next);
    } catch (error) {
      inFlight.current = false;
      if (!mounted.current) return;
      setWorking(false);
      setNote(rampErrorText(error, "No se pudo autorizar. Revisa el estado e intenta de nuevo."));
    } finally {
      release();
    }
  }, [follow, order, view?.actionId]);

  const addTrustline = useCallback(
    async (asset: { code: string; issuer: string }) => {
      if (inFlight.current) return;
      inFlight.current = true;
      setWorking(true);
      setNote(null);
      try {
        const outcome = await setTrustline(asset);
        inFlight.current = false;
        if (!mounted.current) return;
        setWorking(false);
        if (outcome.status === "success" || outcome.status === "pending") {
          void startQuote();
        } else {
          setNote(`No pudimos agregar ${asset.code} a tu wallet. Intenta de nuevo.`);
        }
      } catch {
        inFlight.current = false;
        if (!mounted.current) return;
        setWorking(false);
        setNote(`No pudimos agregar ${asset.code} a tu wallet. Intenta de nuevo.`);
      }
    },
    [setTrustline, startQuote]
  );

  const fields = quote ? rampQuoteFields(quote) : [];
  const fieldsValid = fields.every((field) =>
    rampFieldValid(field, fieldValues[field.key])
  );
  const busy = disabled || working || step === "preparing" || step === "ordering";

  return (
    <div className="rounded-xl border border-tonki-border bg-tonki-canvas px-4 py-3">
      {step === "idle" || step === "preparing" ? (
        <>
          <p className="text-sm text-tonki-text-secondary">
            ¿Sin saldo? Carga pesos con transferencia a tu wallet de Pollar
            (el ticket es de {formatPesos(pesosLabel)}) y vuelve aquí para
            pagar.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => void startQuote()}
            className={`mt-3 ${BUTTON_SECONDARY}`}
          >
            {step === "preparing" ? "Buscando ruta de pago…" : "Cargar saldo con pesos"}
          </button>
          {orderId && step === "idle" ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void resume(orderId)}
              className={`mt-2 ${BUTTON_SECONDARY}`}
            >
              Retomar mi carga anterior
            </button>
          ) : null}
        </>
      ) : null}

      {noQuote ? (
        <div className="mt-3 space-y-2">
          <p className="text-sm text-tonki-text-secondary">{noQuote.message}</p>
          {noQuote.kind === "kyc" ? (
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                openKycModal({
                  corridorId: noQuote.corridorId,
                  onApproved: () => void startQuote(),
                })
              }
              className={BUTTON_SECONDARY}
            >
              Verificar mi identidad
            </button>
          ) : null}
          {noQuote.kind === "trustline" ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void addTrustline(noQuote.asset)}
              className={BUTTON_SECONDARY}
            >
              {working ? "Agregando…" : `Agregar ${noQuote.asset.code} a mi wallet`}
            </button>
          ) : null}
        </div>
      ) : null}

      {(step === "quoted" || step === "ordering") && quote && quoteIntent ? (
        <div className="space-y-3">
          <div>
            <p className="text-sm font-semibold text-tonki-text">
              Cargar {quoteIntent.amount} {quoteIntent.asset_code}
            </p>
            <p className="mt-1 text-sm text-tonki-text-secondary">
              La transferencia es de{" "}
              <span className="font-bold text-tonki-text">
                {formatPesos(quote.amountIn)}
              </span>{" "}
              (total del ticket: {formatPesos(pesosLabel)}). Esos pesos se
              convierten en {quote.amountOut} {quoteIntent.asset_code} dentro
              de tu wallet; el pago al negocio lo confirmas tú después.
            </p>
          </div>

          {fields.length > 0 ? (
            <div className="space-y-3">
              {fields.map((field) => {
                const value = fieldValues[field.key] ?? "";
                const error = value ? rampFieldError(field, value) : null;
                const id = `ramp-${field.key}`;
                return (
                  <div key={field.key}>
                    <label
                      htmlFor={id}
                      className="mb-1.5 block text-sm font-medium text-tonki-text"
                    >
                      {field.label}
                      {field.optional ? " (opcional)" : ""}
                    </label>
                    {field.type === "select" ? (
                      <select
                        id={id}
                        value={value}
                        disabled={busy}
                        onChange={(event) =>
                          setFieldValues((prev) => ({
                            ...prev,
                            [field.key]: event.target.value,
                          }))
                        }
                        className={FIELD}
                      >
                        <option value="">Elige una opción</option>
                        {(field.options ?? []).map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        id={id}
                        type={field.type === "email" ? "email" : field.type === "tel" ? "tel" : "text"}
                        autoComplete="off"
                        value={value}
                        disabled={busy}
                        placeholder={field.placeholder}
                        onChange={(event) =>
                          setFieldValues((prev) => ({
                            ...prev,
                            [field.key]: event.target.value,
                          }))
                        }
                        className={FIELD}
                      />
                    )}
                    {error ? (
                      <p className="mt-1 text-xs text-tonki-danger">{error}</p>
                    ) : field.hint ? (
                      <p className="mt-1 text-xs text-tonki-text-faint">{field.hint}</p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : null}

          <button
            type="button"
            disabled={busy || !fieldsValid}
            onClick={() => void submitOrder()}
            className={BUTTON_PRIMARY}
          >
            {step === "ordering" ? "Creando orden…" : "Continuar con la carga"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={reset}
            className={BUTTON_SECONDARY}
          >
            Cancelar
          </button>
        </div>
      ) : null}

      {step === "following" && view ? (
        <div className="space-y-3">
          <p className="text-sm font-semibold text-tonki-text">{view.title}</p>
          <p className="text-sm text-tonki-text-secondary">{view.message}</p>

          {view.scannable ? (
            <div className="space-y-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={scannableSrc(view.scannable.image)}
                alt="Código para pagar"
                className="mx-auto h-48 w-48 rounded-xl bg-white p-2"
              />
              {view.scannable.payloadLabel && view.scannable.payload ? (
                <p className="break-all text-xs text-tonki-text-muted">
                  {view.scannable.payloadLabel}: {view.scannable.payload}
                </p>
              ) : null}
            </div>
          ) : null}

          {view.details.length > 0 ? (
            <dl className="space-y-1 rounded-xl border border-tonki-border bg-tonki-surface px-4 py-3 text-sm">
              {view.details.map((detail) => (
                <div key={`${detail.label}:${detail.value}`} className="flex justify-between gap-3">
                  <dt className="text-tonki-text-muted">{detail.label}</dt>
                  <dd className="break-all text-right font-semibold text-tonki-text">
                    {detail.value}
                  </dd>
                </div>
              ))}
            </dl>
          ) : null}

          {view.link && view.linkLabel ? (
            <a
              href={view.link}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full rounded-xl border border-tonki-border px-4 py-3 text-center text-sm font-semibold text-tonki-text transition-colors hover:bg-tonki-surface"
            >
              {view.linkLabel}
            </a>
          ) : null}

          {view.phase === "kyc" && !view.link ? (
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                openKycModal({ onApproved: () => void refreshOrder(false) })
              }
              className={BUTTON_SECONDARY}
            >
              Verificar mi identidad
            </button>
          ) : null}

          {view.phase === "sign" ? (
            <button
              type="button"
              disabled={busy || !view.canSign}
              onClick={() => void authorize()}
              className={BUTTON_PRIMARY}
            >
              {working ? "Autorizando…" : "Autorizar"}
            </button>
          ) : null}

          {view.phase === "cosign" ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => openCosignModal()}
              className={BUTTON_SECONDARY}
            >
              Abrir aprobación
            </button>
          ) : null}

          {view.phase === "pay" || view.phase === "kyc" || view.phase === "cosign" ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void refreshOrder(view.phase === "pay")}
              className={BUTTON_SECONDARY}
            >
              {view.phase === "pay" ? "Ya pagué, revisar" : "Revisar estado"}
            </button>
          ) : null}

          {view.phase === "sign" && !view.canSign ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void refreshOrder(false)}
              className={BUTTON_SECONDARY}
            >
              Revisar estado
            </button>
          ) : null}

          {view.waitingOnProvider ? (
            <p className="text-xs text-tonki-text-muted">
              Esperando confirmación…
              {pollTrouble ? " Tu conexión falló; reintentamos solos." : ""}
            </p>
          ) : null}

          {view.phase === "failed" ? (
            <button
              type="button"
              disabled={busy}
              onClick={reset}
              className={BUTTON_SECONDARY}
            >
              Intentar de nuevo
            </button>
          ) : null}

          {view.phase === "completed" ? (
            <p className="text-xs text-tonki-text-muted">
              Tu saldo ya está en tu wallet. Falta confirmar el pago con el
              botón de arriba.
            </p>
          ) : null}

          {active && view.phase !== "sign" ? (
            <button
              type="button"
              disabled={working}
              onClick={() => {
                pollAbort.current?.abort();
                setPaused(true);
              }}
              className="w-full text-center text-xs font-semibold text-tonki-text-muted underline"
            >
              Dejar de esperar
            </button>
          ) : null}

          {paused && !finished && orderId ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void follow(orderId)}
              className={BUTTON_SECONDARY}
            >
              Seguir esperando mi carga
            </button>
          ) : null}
        </div>
      ) : null}

      {step === "following" && !view && working ? (
        <p className="text-sm text-tonki-text-secondary">Retomando tu carga…</p>
      ) : null}

      {note ? (
        <p role="alert" className="mt-3 text-sm text-tonki-danger">
          {note}
        </p>
      ) : null}
    </div>
  );
}
