import { NextResponse } from "next/server";

import { logAndRespondAuthInfrastructureError } from "src/lib/api/authRouteCatch";
import { parseRequestJson } from "src/lib/api/readJsonSafely";
import { apiError, apiSuccess } from "src/lib/api/response";
import { getSessionUserId } from "src/lib/auth/session";
import { loadChargePreview } from "src/lib/charges/preview";
import { settleChargePayment } from "src/lib/charges/settlement/settle";

type RouteContext = {
  params: Promise<{ token: string }>;
};

async function requireUserId() {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false as const, response: apiError("No autenticado", 401) };
  return { ok: true as const, userId };
}

export async function GET(_req: Request, context: RouteContext) {
  try {
    const gate = await requireUserId();
    if (!gate.ok) return gate.response;
    const { token } = await context.params;
    const loaded = await loadChargePreview(token, gate.userId);
    if (!loaded.ok) return apiError(loaded.error, loaded.status);
    return apiSuccess({ charge: loaded.preview });
  } catch (err) {
    const infra = logAndRespondAuthInfrastructureError("[api/cobro GET]", err);
    if (infra) return infra;
    return apiError("Error al cargar el código", 500);
  }
}

/**
 * Settles the charge: verifies the customer's Stellar transfer, then credits
 * Tonkis once. Returns 202 with `retry` while the network has not shown it yet.
 */
export async function POST(req: Request, context: RouteContext) {
  try {
    const gate = await requireUserId();
    if (!gate.ok) return gate.response;
    const { token } = await context.params;
    const json = await parseRequestJson(req);
    const body =
      json && typeof json === "object" ? (json as { tx_hash?: unknown }) : {};
    const txHash = typeof body.tx_hash === "string" ? body.tx_hash : null;

    const credited = await settleChargePayment(token, gate.userId, txHash);
    if (!credited.ok) {
      if (credited.retry) {
        return NextResponse.json(
          { success: false, retry: true, error: credited.error },
          { status: 202 }
        );
      }
      return apiError(credited.error, credited.status);
    }
    return apiSuccess({
      message: `Se acreditaron ${credited.points.toLocaleString("es-MX")} Tonkis.`,
      points: credited.points,
      establishment_name: credited.establishment_name,
      total_points: credited.total_points,
    });
  } catch (err) {
    const infra = logAndRespondAuthInfrastructureError("[api/cobro POST]", err);
    if (infra) return infra;
    return apiError("Error al acreditar Tonkis", 500);
  }
}
