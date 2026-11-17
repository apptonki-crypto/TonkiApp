import { logAndRespondAuthInfrastructureError } from "src/lib/api/authRouteCatch";
import { requireActiveStaffSession } from "src/lib/api/requireActiveStaff";
import { parseRequestJson } from "src/lib/api/readJsonSafely";
import { apiError, apiSuccess } from "src/lib/api/response";
import { getPublicAppOrigin } from "src/lib/auth/publicAppOrigin";
import { createConsumptionCharge } from "src/lib/charges/createCharge";
import { listStaffShiftCharges } from "src/lib/staff/shiftCharges";

/** QR del turno del mesero. */
export async function GET(req: Request) {
  try {
    const gate = await requireActiveStaffSession();
    if (!gate.ok) return gate.response;

    const charges = await listStaffShiftCharges({
      staffUserId: gate.userId,
      adminId: gate.adminId,
      origin: getPublicAppOrigin(req),
    });
    return apiSuccess({ charges });
  } catch (err) {
    const infra = logAndRespondAuthInfrastructureError("[api/staff/charges GET]", err);
    if (infra) return infra;
    return apiError("Error al cargar tus códigos", 500);
  }
}

/** El mesero genera un QR a nombre del negocio; se paga a la wallet del negocio. */
export async function POST(req: Request) {
  try {
    const gate = await requireActiveStaffSession();
    if (!gate.ok) return gate.response;

    const json = await parseRequestJson(req);
    if (!json || typeof json !== "object") {
      return apiError("Cuerpo inválido", 400);
    }
    const body = json as { amount?: unknown; items?: unknown };
    const amountRaw =
      typeof body.amount === "string"
        ? body.amount
        : typeof body.amount === "number" && Number.isFinite(body.amount)
          ? String(body.amount)
          : null;

    const created = await createConsumptionCharge({
      adminId: gate.adminId,
      createdByStaffId: gate.userId,
      amountRaw,
      items: body.items,
      origin: getPublicAppOrigin(req),
    });
    if (!created.ok) {
      // El texto genérico habla del negocio del usuario; aquí el usuario es el mesero.
      const error =
        created.error === "No tienes un establecimiento configurado"
          ? "El negocio todavía no está configurado."
          : created.error;
      return apiError(error, created.status);
    }

    return apiSuccess({
      message: "Código listo. El cliente recibirá Tonkis cuando su pago se confirme.",
      charge: created.charge,
    });
  } catch (err) {
    const infra = logAndRespondAuthInfrastructureError("[api/staff/charges POST]", err);
    if (infra) return infra;
    return apiError("Error al generar el código", 500);
  }
}
