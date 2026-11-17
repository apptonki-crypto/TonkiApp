import { describe, expect, it } from "vitest";
import { PollarApiError, type RampOrder, type RampRoute } from "@pollar/core";

import type { PaymentIntent } from "src/lib/charges/types";

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
  rampFailureText,
  rampStateToStore,
  routeAssetMatchesIntent,
} from "./ramp";

const ISSUER = `G${"A".repeat(55)}`;
const OTHER_ISSUER = `G${"B".repeat(55)}`;

const xlmIntent: Pick<PaymentIntent, "asset" | "asset_code" | "amount"> = {
  asset: { type: "native" },
  asset_code: "XLM",
  amount: "33.3333334",
};
const usdcIntent: Pick<PaymentIntent, "asset" | "asset_code" | "amount"> = {
  asset: { type: "credit_alphanum4", code: "USDC", issuer: ISSUER },
  asset_code: "USDC",
  amount: "5.9000000",
};

function route(
  currency: string,
  rail: RampRoute["fiat"]["rail"],
  code: string,
  identifier: string | null,
  chain: RampRoute["asset"]["chain"] = "STELLAR",
  country = "MX"
): RampRoute {
  return {
    fiat: { kind: "fiat", currency, rail, country },
    asset: { kind: "asset", code, identifier, chain },
    legs: ["PROVIDER_ONRAMP"],
  };
}

const routes: RampRoute[] = [
  route("BRL", "PIX", "USDC", ISSUER, "STELLAR", "BR"),
  route("MXN", "BANK_TRANSFER", "USDC", ISSUER),
  route("MXN", "SPEI", "USDC", OTHER_ISSUER),
  route("MXN", "SPEI", "USDC", ISSUER),
  route("MXN", "SPEI", "USDC", ISSUER, "POLYGON"),
  route("MXN", "SPEI", "XLM", null),
];

describe("missingOnrampRouteMessage", () => {
  it("explains empty routes on testnet vs mainnet", () => {
    expect(missingOnrampRouteMessage([], xlmIntent, "testnet")).toContain(
      "testnet"
    );
    expect(missingOnrampRouteMessage([], xlmIntent, "mainnet")).toContain(
      "dashboard.pollar.xyz"
    );
  });

  it("names the asset when routes exist but none match", () => {
    expect(
      missingOnrampRouteMessage(
        [route("MXN", "SPEI", "USDC", ISSUER)],
        xlmIntent,
        "testnet"
      )
    ).toContain("XLM");
  });
});

describe("pickOnrampRoute", () => {
  it("prefers SPEI and matches the locked issuer", () => {
    const picked = pickOnrampRoute(routes, usdcIntent);
    expect(picked?.fiat.rail).toBe("SPEI");
    expect(picked?.asset.identifier).toBe(ISSUER);
    expect(picked?.asset.chain).toBe("STELLAR");
  });

  it("falls back to another MXN rail when SPEI is missing", () => {
    const picked = pickOnrampRoute(
      routes.filter((r) => r.fiat.rail !== "SPEI"),
      usdcIntent
    );
    expect(picked?.fiat.rail).toBe("BANK_TRANSFER");
  });

  it("matches native XLM only on a null identifier", () => {
    expect(pickOnrampRoute(routes, xlmIntent)?.asset.code).toBe("XLM");
    expect(
      pickOnrampRoute([route("MXN", "SPEI", "XLM", ISSUER)], xlmIntent)
    ).toBeNull();
  });

  it("returns null when no MXN/Stellar route delivers the asset", () => {
    expect(pickOnrampRoute([], usdcIntent)).toBeNull();
    expect(
      pickOnrampRoute([route("MXN", "SPEI", "USDC", OTHER_ISSUER)], usdcIntent)
    ).toBeNull();
    expect(
      pickOnrampRoute([route("BRL", "PIX", "USDC", ISSUER, "STELLAR", "BR")], usdcIntent)
    ).toBeNull();
  });
});

describe("routeAssetMatchesIntent", () => {
  it("accepts CODE:ISSUER identifiers and refuses an issued asset without one", () => {
    expect(
      routeAssetMatchesIntent(
        { code: "USDC", identifier: `USDC:${ISSUER}`, chain: "STELLAR" },
        usdcIntent
      )
    ).toBe(true);
    expect(
      routeAssetMatchesIntent(
        { code: "USDC", identifier: null, chain: "STELLAR" },
        usdcIntent
      )
    ).toBe(false);
  });
});

describe("buildQuoteRequest", () => {
  it("fixes the asset the charge needs with denomination out", () => {
    const picked = pickOnrampRoute(routes, usdcIntent)!;
    expect(buildQuoteRequest(picked, usdcIntent)).toEqual({
      direction: "ONRAMP",
      fiat: { currency: "MXN", rail: "SPEI", country: "MX" },
      asset: { code: "USDC", identifier: ISSUER, chain: "STELLAR" },
      amount: { value: "5.9000000", denomination: "out" },
    });
  });
});

function order(partial: Partial<RampOrder>): Pick<
  RampOrder,
  "state" | "pendingAction" | "failure"
> {
  return { state: "pending", pendingAction: null, failure: null, ...partial };
}

describe("describeRampOrder", () => {
  it("shows bank transfer details for a FIAT_PAYMENT", () => {
    const view = describeRampOrder(
      order({
        pendingAction: {
          kind: "FIAT_PAYMENT",
          actionId: "a1",
          legIndex: 0,
          expiresAt: null,
          instructions: {
            kind: "bank_transfer",
            amount: "105.20",
            currency: "MXN",
            details: [{ label: "CLABE", value: "646180000000000001" }],
            reference: "REF123",
          },
        },
      })
    );
    expect(view.phase).toBe("pay");
    expect(view.title).toBe("Paga 105.20 MXN");
    expect(view.details).toEqual([
      { label: "CLABE", value: "646180000000000001" },
      { label: "Reference", value: "REF123" },
    ]);
  });

  it("exposes the rendered QR for a qr instruction", () => {
    const scannable = {
      kind: "opaque" as const,
      payload: "000201",
      payloadLabel: "Código",
      image: {
        mediaType: "image/svg+xml" as const,
        encoding: "utf8" as const,
        data: "<svg/>",
        inlineSafe: true,
      },
    };
    const view = describeRampOrder(
      order({
        pendingAction: {
          kind: "FIAT_PAYMENT",
          actionId: "a1",
          legIndex: 0,
          expiresAt: null,
          instructions: {
            kind: "qr",
            payload: "000201",
            amount: "10",
            currency: "MXN",
            scannable,
          },
        },
      })
    );
    expect(view.phase).toBe("pay");
    expect(view.scannable).toEqual(scannable);
  });

  it("closes an expired payment instead of showing stale data", () => {
    const view = describeRampOrder(
      order({
        pendingAction: {
          kind: "FIAT_PAYMENT",
          actionId: "a1",
          legIndex: 0,
          expiresAt: new Date(Date.now() - 60_000).toISOString(),
          instructions: {
            kind: "bank_transfer",
            amount: "10",
            currency: "MXN",
            details: [{ label: "CLABE", value: "1" }],
            reference: null,
          },
        },
      })
    );
    expect(view.phase).toBe("failed");
    expect(view.details).toEqual([]);
  });

  it("asks for verification with a link for KYC", () => {
    const view = describeRampOrder(
      order({
        pendingAction: {
          kind: "KYC",
          actionId: "k1",
          legIndex: 0,
          steps: [],
          url: "https://kyc.example.com/start",
        },
      })
    );
    expect(view.phase).toBe("kyc");
    expect(view.link).toBe("https://kyc.example.com/start");
  });

  it("requires an explicit authorize for SIGNATURE", () => {
    const view = describeRampOrder(
      order({
        pendingAction: {
          kind: "SIGNATURE",
          actionId: "s1",
          legIndex: 1,
          chain: "STELLAR",
          payload: { encoding: "xdr", value: "AAAA" },
          summary: "",
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        },
      })
    );
    expect(view.phase).toBe("sign");
    expect(view.canSign).toBe(true);
    expect(view.actionId).toBe("s1");
  });

  it("reports completed and failed orders in Spanish", () => {
    expect(describeRampOrder(order({ state: "completed" })).phase).toBe("completed");
    const failed = describeRampOrder(
      order({
        state: "failed",
        failure: {
          legIndex: 0,
          code: "X",
          retryable: false,
          resolutionOwner: "user",
          resolutionAction: "add_funds",
          detail: null,
        },
      })
    );
    expect(failed.phase).toBe("failed");
    expect(failed.message).toBe(
      "Tu wallet no tiene saldo suficiente. Agrega fondos e intenta de nuevo."
    );
  });

  it("keeps waiting on the provider when nothing is pending", () => {
    const view = describeRampOrder(order({ state: "processing" }));
    expect(view.phase).toBe("processing");
    expect(view.waitingOnProvider).toBe(true);
  });
});

describe("small helpers", () => {
  it("knows the final states and stores a short lowercase state", () => {
    expect(isRampOrderFinal("completed")).toBe(true);
    expect(isRampOrderFinal("refunded")).toBe(true);
    expect(isRampOrderFinal("pending")).toBe(false);
    expect(rampStateToStore({ state: " Pending_Fiat " })).toBe("pending_fiat");
  });

  it("falls back to support text for an unknown resolution", () => {
    expect(rampFailureText({ resolutionAction: "nope" })).toContain("soporte");
  });

  it("formats pesos and keeps unparseable text", () => {
    expect(formatPesos("105.2")).toContain("105.20");
    expect(formatPesos("abc")).toBe("abc");
  });
});

describe("quoteCoversAmount", () => {
  it("compares decimals without float drift", () => {
    expect(quoteCoversAmount("5.9000000", "5.9000000")).toBe(true);
    expect(quoteCoversAmount("5.91", "5.9000000")).toBe(true);
    expect(quoteCoversAmount("5.8999999", "5.9000000")).toBe(false);
    expect(quoteCoversAmount("abc", "5.9")).toBe(false);
  });
});

function rejection(
  action: string,
  extra: Record<string, unknown> = {}
): Parameters<typeof describeNoQuote>[0][number] {
  return {
    legs: [],
    failure: {
      code: "X",
      legIndex: 0,
      retryable: false,
      resolutionOwner: "user",
      resolutionAction: action,
    },
    ...extra,
  } as Parameters<typeof describeNoQuote>[0][number];
}

describe("describeNoQuote", () => {
  it("offers a KYC button when verification is open", () => {
    const view = describeNoQuote([
      rejection("complete_verification", {
        requirement: {
          corridorId: "mx-spei",
          position: 0,
          completed: 0,
          total: 1,
          type: "KYC",
          optionId: "o",
          status: "none",
        },
      }),
    ]);
    expect(view).toMatchObject({ kind: "kyc", corridorId: "mx-spei" });
  });

  it("offers a trustline for the delivered Stellar asset", () => {
    const view = describeNoQuote([
      rejection("add_trustline", {
        legs: [
          {
            index: 0,
            kind: "PROVIDER_ONRAMP",
            from: { kind: "fiat", currency: "MXN", rail: "SPEI", country: "MX" },
            to: { kind: "asset", code: "USDC", identifier: ISSUER, chain: "STELLAR" },
          },
        ],
      }),
    ]);
    expect(view).toMatchObject({
      kind: "trustline",
      asset: { code: "USDC", issuer: ISSUER },
    });
  });

  it("explains a refused verification and a plain resolution in Spanish", () => {
    const refused = describeNoQuote([
      rejection("complete_verification", {
        requirement: {
          corridorId: "c",
          position: 0,
          completed: 0,
          total: 1,
          type: "KYC",
          optionId: "o",
          status: "rejected",
        },
      }),
    ]);
    expect(refused).toMatchObject({ kind: "text" });
    expect(describeNoQuote([rejection("change_amount")])).toEqual({
      kind: "text",
      message: "Este monto queda fuera de lo que acepta la ruta.",
    });
  });
});

describe("rampErrorText", () => {
  it("maps known Pollar codes and falls back otherwise", () => {
    expect(
      rampErrorText(new PollarApiError("SDK_RAMPS_QUOTE_EXPIRED"), "x")
    ).toBe("La cotización venció. Cotiza de nuevo.");
    expect(rampErrorText(new Error("boom"), "Intenta de nuevo")).toBe(
      "Intenta de nuevo"
    );
    expect(
      rampErrorText(
        new PollarApiError("VALIDATION_ERROR", { message: "CLABE inválida" }),
        "x"
      )
    ).toContain("CLABE inválida");
  });
});
