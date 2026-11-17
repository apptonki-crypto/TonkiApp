import { logAndRespondAuthInfrastructureError } from "src/lib/api/authRouteCatch";
import { requireActiveAdminSession } from "src/lib/api/requireActiveAdmin";
import { apiError, apiSuccess } from "src/lib/api/response";
import { getPublicAppOrigin } from "src/lib/auth/publicAppOrigin";
import { renderChargeQrDataUrl } from "src/lib/charges/chargeQr";
import {
  ensurePresentationToken,
  presentationUrl,
} from "src/lib/establishment/presentation";

async function respond(req: Request, rotate: boolean) {
  const gate = await requireActiveAdminSession();
  if (!gate.ok) return gate.response;

  const result = await ensurePresentationToken(gate.userId, { rotate });
  if (!result.ok) return apiError(result.error, result.status);

  const url = presentationUrl(getPublicAppOrigin(req), result.token);
  // Más grande y con más corrección que el QR de cobro: se imprime y se pega en el mostrador.
  const qr_image = await renderChargeQrDataUrl(url, {
    width: 720,
    errorCorrectionLevel: "Q",
  });
  return apiSuccess({
    presentation: {
      establishment_id: result.establishment_id,
      establishment_name: result.establishment_name,
      url,
      qr_image,
    },
  });
}

/** QR de presentación del negocio. Lo crea la primera vez. */
export async function GET(req: Request) {
  try {
    return await respond(req, false);
  } catch (err) {
    const infra = logAndRespondAuthInfrastructureError("[api/establishment/presentation GET]", err);
    if (infra) return infra;
    return apiError("No se pudo cargar el QR de presentación", 500);
  }
}

/** Genera un QR nuevo. El anterior deja de funcionar. */
export async function POST(req: Request) {
  try {
    return await respond(req, true);
  } catch (err) {
    const infra = logAndRespondAuthInfrastructureError("[api/establishment/presentation POST]", err);
    if (infra) return infra;
    return apiError("No se pudo generar un QR nuevo", 500);
  }
}
