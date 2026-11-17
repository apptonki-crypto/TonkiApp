import {
  describeRampAction,
  isPollarApiError,
  rampRequirementCopy,
  rampTrustlineAsset,
  type RampFailure,
  type RampOrder,
  type RampQuoteRejection,
  type RampQuoteRequest,
  type RampRoute,
  type RampScannable,
} from "@pollar/core";

import type { PaymentIntent } from "src/lib/charges/types";
import type { PollarNetwork } from "src/lib/auth/pollarPublicConfig";

export const RAMP_FIAT_CURRENCY = "MXN";
export const RAMP_FIAT_COUNTRY = "MX";
export const RAMP_PREFERRED_RAIL = "SPEI";

const FINAL_STATES = ["completed", "failed", "refunded"];

type IntentAsset = Pick<PaymentIntent, "asset" | "asset_code">;

/**
 * Pollar reports a Stellar asset as `code` plus `identifier`: null for native
 * XLM, the issuer account for an issued asset (some backends send CODE:ISSUER,
 * so both are accepted). An issued asset without an identifier never matches,
 * because the code alone cannot tell two issuers apart.
 */
export function routeAssetMatchesIntent(
  routeAsset: Pick<RampRoute["asset"], "code" | "identifier" | "chain">,
  intent: IntentAsset
): boolean {
  if (routeAsset.chain !== "STELLAR") return false;
  const code = routeAsset.code.trim().toUpperCase();
  if (code !== intent.asset_code.trim().toUpperCase()) return false;

  if (intent.asset.type === "native") {
    return routeAsset.identifier === null || routeAsset.identifier === "";
  }
  const identifier = routeAsset.identifier?.trim();
  if (!identifier) return false;
  const issuer = intent.asset.issuer;
  return identifier === issuer || identifier === `${intent.asset.code}:${issuer}`;
}

/**
 * The MXN ONRAMP route on Stellar that delivers the asset locked in the intent.
 * SPEI wins when several rails exist. Null means this app cannot load pesos
 * for that asset.
 */
export function pickOnrampRoute(
  routes: readonly RampRoute[],
  intent: IntentAsset
): RampRoute | null {
  const candidates = routes.filter(
    (route) =>
      route.fiat.currency.toUpperCase() === RAMP_FIAT_CURRENCY &&
      route.fiat.country.toUpperCase() === RAMP_FIAT_COUNTRY &&
      routeAssetMatchesIntent(route.asset, intent)
  );
  return (
    candidates.find((route) => route.fiat.rail === RAMP_PREFERRED_RAIL) ??
    candidates[0] ??
    null
  );
}

/**
 * Customer-facing copy when `pickOnrampRoute` returns null. An empty route list
 * usually means the Pollar app has no on-ramp corridors (common on testnet).
 */
export function missingOnrampRouteMessage(
  routes: readonly RampRoute[],
  intent: Pick<PaymentIntent, "asset_code">,
  network: PollarNetwork
): string {
  if (routes.length === 0) {
    if (network === "testnet") {
      return (
        "En testnet esta app no tiene rutas para cargar pesos (SPEI). " +
        "Habilita el on-ramp en dashboard.pollar.xyz, usa claves de mainnet para probar la carga, " +
        "o paga con el saldo de tu wallet."
      );
    }
    return (
      "No hay rutas para cargar pesos (SPEI) en esta app de Pollar. " +
      "Activa el on-ramp (MXN) en dashboard.pollar.xyz o paga con el saldo de tu wallet."
    );
  }
  return `En esta app no se puede cargar pesos para ${intent.asset_code}. Paga con el saldo de tu wallet.`;
}

/**
 * Quote for exactly what the cobro needs to receive: `out` fixes the asset
 * amount, so the pesos charged by the ramp are whatever that costs.
 */
export function buildQuoteRequest(
  route: RampRoute,
  intent: Pick<PaymentIntent, "amount">
): RampQuoteRequest {
  return {
    direction: "ONRAMP",
    fiat: {
      currency: route.fiat.currency,
      rail: route.fiat.rail,
      country: route.fiat.country,
    },
    asset: {
      code: route.asset.code,
      identifier: route.asset.identifier,
      chain: route.asset.chain,
    },
    amount: { value: intent.amount, denomination: "out" },
  };
}

export function isRampOrderFinal(state: string): boolean {
  return FINAL_STATES.includes(state);
}

/** Pesos as a label, e.g. "$105.20". Falls back to the raw text. */
export function formatPesos(value: string): string {
  const number = Number(value);
  if (!Number.isFinite(number)) return value;
  return number.toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
  });
}

const RESOLUTION_ES: Record<string, string> = {
  accept_new_quote: "El precio cambió. Cotiza de nuevo para continuar.",
  add_funds: "Tu wallet no tiene saldo suficiente. Agrega fondos e intenta de nuevo.",
  approve_again: "La aprobación venció. Aprueba el paso de nuevo.",
  automatic_retry: "Se está reintentando solo. No necesitas hacer nada.",
  change_amount: "Este monto queda fuera de lo que acepta la ruta.",
  complete_verification: "Completa la verificación de identidad para continuar.",
  correct_input: "Algunos datos no se aceptaron. Revísalos e inicia de nuevo.",
  link_wallet: "Esta ruta necesita una wallet en otra red.",
  create_wallet: "Necesitas una wallet para recibir el saldo.",
  set_up_wallet: "Esta ruta pasa por otra red. Configura tu wallet ahí para continuar.",
  migrate_custody: "Tu wallet aún depende solo de Pollar. Muévela a la wallet segura de la app.",
  set_up_recovery: "Tu wallet necesita un método de recuperación antes de firmar.",
  add_trustline: "Tu wallet debe aceptar este activo para recibirlo. Agrega la línea de confianza e intenta de nuevo.",
  sign_again: "La firma venció. Firma el paso de nuevo.",
  start_again: "No se pudo completar. Inicia una carga nueva; no se cobró nada.",
  fund_gas_wallet: "Esta ruta no está disponible por ahora. Intenta más tarde.",
  enable_signing_mode: "Esta ruta no está disponible para tu wallet en esta app.",
  wait_reconciliation: "Estamos confirmando dónde están los fondos. No necesitas empezar de nuevo.",
  pollar_follows_up: "Estamos revisando el caso. Tus fondos están a salvo; contacta a soporte con el id de la orden si necesitas ayuda.",
  contact_pollar: "Algo salió mal de nuestro lado. Contacta a soporte con el id de la orden.",
};

/** What the customer can do after a failure, in Spanish. */
export function rampFailureText(
  failure: Pick<RampFailure, "resolutionAction"> | null | undefined
): string {
  if (!failure) return RESOLUTION_ES.start_again;
  return RESOLUTION_ES[failure.resolutionAction] ?? RESOLUTION_ES.contact_pollar;
}

export type RampPhase =
  | "pay"
  | "kyc"
  | "sign"
  | "cosign"
  | "processing"
  | "completed"
  | "failed";

export type RampOrderView = {
  phase: RampPhase;
  title: string;
  message: string;
  /** Bank transfer coordinates, as the provider labels them. Never persisted. */
  details: Array<{ label: string; value: string }>;
  scannable: RampScannable | null;
  /** https link to pay or verify, already checked by Pollar. */
  link: string | null;
  linkLabel: string | null;
  /** The pending action to sign, when `phase` is `sign`. */
  actionId: string | null;
  canSign: boolean;
  /** True while Pollar still moves the order without the customer. */
  waitingOnProvider: boolean;
};

type OrderLike = Pick<RampOrder, "state" | "pendingAction" | "failure">;

/** Turns a Pollar order into what the card shows. Pure: no network. */
export function describeRampOrder(order: OrderLike): RampOrderView {
  const base: RampOrderView = {
    phase: "processing",
    title: "Procesando tu carga",
    message: "Estamos esperando la confirmación. Puedes dejar esta pantalla abierta.",
    details: [],
    scannable: null,
    link: null,
    linkLabel: null,
    actionId: null,
    canSign: false,
    waitingOnProvider: true,
  };

  if (order.state === "completed") {
    return {
      ...base,
      phase: "completed",
      title: "Saldo cargado",
      message: "Ya puedes pagar con tu wallet.",
      waitingOnProvider: false,
    };
  }
  if (order.state === "failed" || order.state === "refunded") {
    return {
      ...base,
      phase: "failed",
      title:
        order.state === "refunded" ? "Carga reembolsada" : "No se pudo cargar saldo",
      message:
        order.state === "refunded"
          ? "La carga no se completó y se reembolsó."
          : rampFailureText(order.failure),
      waitingOnProvider: false,
    };
  }

  const action = order.pendingAction;
  if (!action) return base;
  const described = describeRampAction({
    state: order.state,
    pendingAction: action,
  });

  switch (action.kind) {
    case "FIAT_PAYMENT": {
      if (described.paymentClosed) {
        return {
          ...base,
          phase: "failed",
          title: "El pago venció",
          message: "Ya no se puede pagar con estos datos. Inicia una carga nueva.",
          waitingOnProvider: false,
        };
      }
      const instructions = action.instructions;
      const amount = `${instructions.amount} ${instructions.currency}`;
      return {
        ...base,
        phase: "pay",
        title: `Paga ${amount}`,
        message: described.codeMissing
          ? "El código de pago no llegó. Revisa de nuevo en unos segundos."
          : instructions.kind === "qr"
            ? "Escanea el código o paga desde la liga. Cuando el banco confirme, tu saldo se carga solo."
            : "Haz la transferencia con estos datos. Cuando el banco confirme, tu saldo se carga solo.",
        details: described.details,
        scannable: described.scannable,
        link: described.link,
        linkLabel: described.link ? "Abrir página de pago" : null,
        waitingOnProvider: false,
      };
    }
    case "KYC":
      return {
        ...base,
        phase: "kyc",
        title: "Verifica tu identidad",
        message:
          described.note ??
          "El proveedor necesita verificar tu identidad antes de recibir tu pago.",
        link: described.link,
        linkLabel: described.link ? "Completar verificación" : null,
        waitingOnProvider: false,
      };
    case "SIGNATURE":
      return {
        ...base,
        phase: "sign",
        title: "Autoriza el envío a tu wallet",
        message: described.canSign
          ? action.summary || "Autoriza la operación para terminar tu carga."
          : "La autorización venció. Revisa el estado para pedir una nueva.",
        actionId: action.actionId,
        canSign: described.canSign,
        waitingOnProvider: false,
      };
    case "COSIGN_APPROVAL":
      return {
        ...base,
        phase: "cosign",
        title: "Aprueba en tu dispositivo",
        message:
          action.summary || "Aprueba la operación en tu dispositivo para continuar.",
        waitingOnProvider: false,
      };
    default:
      return base;
  }
}

/** The state to remember on the charge; Pollar states are short snake_case. */
export function rampStateToStore(order: Pick<RampOrder, "state">): string {
  return order.state.trim().toLowerCase().slice(0, 20);
}

const DECIMALS = 7;

function toUnits(value: string): bigint | null {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(value.trim());
  if (!match) return null;
  const fraction = (match[2] ?? "").padEnd(DECIMALS, "0").slice(0, DECIMALS);
  return BigInt(match[1] + fraction);
}

/** True when the quoted output is at least what the charge needs to receive. */
export function quoteCoversAmount(amountOut: string, needed: string): boolean {
  const out = toUnits(amountOut);
  const min = toUnits(needed);
  return out !== null && min !== null && out >= min;
}

export type NoQuoteView =
  | { kind: "text"; message: string }
  | { kind: "kyc"; message: string; corridorId: string }
  | {
      kind: "trustline";
      message: string;
      asset: { code: string; issuer: string };
    };

/**
 * Why a quote found no route, and the one thing the customer can do about it.
 * FORM, REGISTRY_CHECK and PROVIDER_REGISTRATION are not offered a screen here;
 * those steps are documented in docs/RAMP_REGISTRO.md.
 */
export function describeNoQuote(
  rejected: ReadonlyArray<
    Pick<RampQuoteRejection, "failure" | "legs"> &
      Partial<Pick<RampQuoteRejection, "requirement">>
  >
): NoQuoteView {
  for (const rejection of rejected) {
    const asset = rampTrustlineAsset(rejection);
    if (asset) {
      return {
        kind: "trustline",
        message: `Tu wallet debe aceptar ${asset.code} para recibirlo. Agrega la línea de confianza y cotiza de nuevo.`,
        asset,
      };
    }
  }
  for (const rejection of rejected) {
    const requirement = rejection.requirement;
    if (requirement?.type === "KYC" && rampRequirementCopy(requirement).action) {
      return {
        kind: "kyc",
        corridorId: requirement.corridorId,
        message: "Verifica tu identidad para ver esta ruta de pago.",
      };
    }
  }
  const requirements = rejected.map((r) => r.requirement);
  if (
    requirements.length > 0 &&
    requirements.every((r) => r && rampRequirementCopy(r).action === null)
  ) {
    return {
      kind: "text",
      message: requirements.every((r) => r?.status === "rejected")
        ? "Tu verificación de identidad no fue aprobada, así que no hay ruta disponible."
        : "Tu verificación está en revisión. No necesitas hacer nada; vuelve a intentar más tarde.",
    };
  }
  const actions = [...new Set(rejected.map((r) => r.failure.resolutionAction))];
  return {
    kind: "text",
    message:
      actions.length === 1
        ? rampFailureText({ resolutionAction: actions[0] })
        : "Ninguna ruta puede tomar este monto ahora. Intenta más tarde.",
  };
}

const ERROR_ES: Record<string, string> = {
  SDK_RAMPS_QUOTE_EXPIRED: "La cotización venció. Cotiza de nuevo.",
  SDK_RAMPS_QUOTE_NOT_FOUND: "La cotización ya no está disponible. Cotiza de nuevo.",
  SDK_RAMPS_ACTION_STALE: "Este paso cambió. Revisa el estado e intenta de nuevo.",
  SDK_RAMPS_TX_NOT_FOUND: "No encontramos esta orden de carga.",
  SDK_RAMPS_WALLET_NOT_READY:
    "Aprueba la nueva cuenta de tu wallet en tu dispositivo e intenta de nuevo.",
};

/** A Pollar ramp error as the customer reads it. Never leaks raw ids. */
export function rampErrorText(error: unknown, fallback: string): string {
  if (isPollarApiError(error)) {
    const known = ERROR_ES[error.code];
    if (known) return known;
    if (error.code === "VALIDATION_ERROR") {
      const message = error.body.message;
      if (typeof message === "string" && message.trim() && !/^[A-Z0-9_]+$/.test(message)) {
        return `Pollar no aceptó los datos: ${message}`;
      }
    }
  }
  return fallback;
}
