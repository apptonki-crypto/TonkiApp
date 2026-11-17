import { logAndRespondAuthInfrastructureError } from "src/lib/api/authRouteCatch";
import { requireActiveAdminSession } from "src/lib/api/requireActiveAdmin";
import { parseRequestJson } from "src/lib/api/readJsonSafely";
import { apiError, apiSuccess } from "src/lib/api/response";
import { getPublicAppOrigin } from "src/lib/auth/publicAppOrigin";
import { createConsumptionCharge } from "src/lib/charges/createCharge";

export async function POST(req: Request) {
  try {
    const gate = await requireActiveAdminSession();
    if (!gate.ok) return gate.response;

    const json = await parseRequestJson(req);
    if (!json || typeof json !== "object") {
      return apiError("Cuerpo inválido", 400);
    }
    const body = json as { amount?: unknown; items?: unknown };
    const amount = body.amount;
    const amountRaw =
      typeof amount === "string"
        ? amount
        : typeof amount === "number" && Number.isFinite(amount)
          ? String(amount)
          : null;
    const items = body.items;

    const created = await createConsumptionCharge({
      adminId: gate.userId,
      amountRaw,
      items,
      origin: getPublicAppOrigin(req),
    });
    if (!created.ok) return apiError(created.error, created.status);

    return apiSuccess({
      message: "Código listo. El cliente recibirá Tonkis cuando su pago se confirme.",
      charge: created.charge,
    });
  } catch (err) {
    const infra = logAndRespondAuthInfrastructureError("[api/charges POST]", err);
    if (infra) return infra;
    return apiError("Error al generar el código", 500);
  }
}
