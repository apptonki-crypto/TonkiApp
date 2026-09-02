// app/api/business/register/route.ts
import { createHash, randomUUID, timingSafeEqual } from "crypto";

import { parseRequestJson } from "src/lib/api/readJsonSafely";
import { apiError, apiSuccess } from "src/lib/api/response";
import { registerBusinessAccount } from "src/lib/business/registerBusiness";
import {
  logBusinessRegisterError,
  logBusinessRegisterRejection,
  resolveBusinessRegisterInfrastructureError,
} from "src/lib/business/registerBusinessLogger";

const SECRET_HEADER = "x-business-register-secret";
const ROUTE_LABEL = "[api/business/register]";

function secretsMatch(expected: string, received: string): boolean {
  const a = createHash("sha256").update(expected).digest();
  const b = createHash("sha256").update(received).digest();
  return timingSafeEqual(a, b);
}

function readRegisterSecret(): string | null {
  const value = process.env.BUSINESS_REGISTER_SECRET?.trim();
  return value && value.length > 0 ? value : null;
}

function clientIp(req: Request): string | null {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

export async function POST(req: Request) {
  const requestId = randomUUID();
  const ip = clientIp(req);

  try {
    const configuredSecret = readRegisterSecret();
    if (!configuredSecret) {
      logBusinessRegisterRejection(ROUTE_LABEL, {
        requestId,
        stage: "secret_check",
        reason: "BUSINESS_REGISTER_SECRET no configurado en el servidor",
        ip,
      });
      return apiError("Registro empresarial no configurado", 503);
    }

    const providedSecret = req.headers.get(SECRET_HEADER)?.trim() ?? "";
    if (!providedSecret || !secretsMatch(configuredSecret, providedSecret)) {
      logBusinessRegisterRejection(ROUTE_LABEL, {
        requestId,
        stage: "secret_check",
        reason: providedSecret ? "secret inválido" : "secret ausente",
        ip,
      });
      return apiError("No autorizado", 401);
    }

    const raw = await parseRequestJson(req);
    if (raw === null) {
      logBusinessRegisterRejection(ROUTE_LABEL, {
        requestId,
        stage: "parse_body",
        reason: "cuerpo no es JSON válido",
        ip,
      });
      return apiError("Cuerpo JSON inválido", 400);
    }

    const result = await registerBusinessAccount(raw);
    if (!result.ok) {
      logBusinessRegisterRejection(ROUTE_LABEL, {
        requestId,
        stage: result.status === 409 ? "user_lookup" : "validation",
        reason: `${result.status} ${result.error}`,
        ip,
      });
      return apiError(result.error, result.status);
    }

    console.info(ROUTE_LABEL, {
      requestId,
      establishmentId: result.data.establishment.id,
      status: 201,
    });
    return apiSuccess(result.data, 201);
  } catch (err) {
    logBusinessRegisterError(ROUTE_LABEL, err, { requestId });

    const infraMessage = resolveBusinessRegisterInfrastructureError(err);
    if (infraMessage) {
      return apiError(infraMessage, 503);
    }

    return apiError("Error al crear la cuenta empresarial", 500);
  }
}
