import { parseRequestJson } from "src/lib/api/readJsonSafely";
import { apiError, apiSuccess } from "src/lib/api/response";
import { logAndRespondAuthInfrastructureError } from "src/lib/api/authRouteCatch";
import {
  BUSINESS_ONBOARDING_PATH,
  requiresBusinessProfile,
} from "src/lib/auth/businessProfile";
import { toPublicUserDTO } from "src/lib/auth/dto";
import {
  findOrCreateUserFromPollar,
  PollarLinkError,
} from "src/lib/auth/pollarAccount";
import { sanitizeAuthReturnPath } from "src/lib/auth/sanitizeReturnPath";
import { pollarSessionSchema } from "src/lib/auth/schemas";
import {
  attachSessionCookie,
  createSessionToken,
} from "src/lib/auth/session";
import { normalizeUserRole } from "src/lib/auth/userRole";
import {
  PollarVerifyError,
  registerPollarExternalUser,
  verifyPollarAccessToken,
} from "src/lib/auth/verifyPollarToken";
import { defaultHomeForRole } from "src/lib/staff/constants";
import type { AuthResponse } from "src/types/auth";

function verifyErrorMessage(reason: PollarVerifyError["reason"]): {
  message: string;
  status: number;
} {
  switch (reason) {
    case "missing_secret":
      return {
        message: "Pollar no está configurado en el servidor.",
        status: 503,
      };
    case "invalid_token":
      return {
        message: "La sesión de Pollar expiró. Vuelve a iniciar sesión.",
        status: 401,
      };
    case "wrong_app":
      return {
        message: "Esa sesión de Pollar no pertenece a esta aplicación.",
        status: 403,
      };
    case "bad_api_key":
      return {
        message: "La clave de Pollar del servidor no es válida.",
        status: 503,
      };
    case "profile_invalid":
      return {
        message: "Pollar no devolvió un perfil utilizable.",
        status: 502,
      };
    default:
      return {
        message: "No se pudo verificar la sesión con Pollar.",
        status: 502,
      };
  }
}

function linkErrorMessage(reason: PollarLinkError["reason"]): string {
  switch (reason) {
    case "duplicate_email":
      return "Ese correo está en más de una cuenta de Tonki. Contacta a soporte antes de entrar.";
    case "ambiguous_wallet":
      return "Esa wallet está en más de una cuenta de Tonki. Contacta a soporte antes de entrar.";
    default:
      return "No pudimos vincular tu cuenta de forma única. Contacta a soporte.";
  }
}

export async function POST(req: Request) {
  try {
    const raw = await parseRequestJson(req);
    if (raw === null) {
      return apiError("Error de autenticación: cuerpo JSON inválido", 400);
    }

    const parsed = pollarSessionSchema.safeParse(raw);
    if (!parsed.success) {
      return apiError("Error de autenticación: datos incompletos", 400);
    }

    let identity;
    try {
      identity = await verifyPollarAccessToken(parsed.data.token);
    } catch (err) {
      if (err instanceof PollarVerifyError) {
        const mapped = verifyErrorMessage(err.reason);
        return apiError(mapped.message, mapped.status);
      }
      throw err;
    }

    let linked;
    try {
      linked = await findOrCreateUserFromPollar(identity);
    } catch (err) {
      if (err instanceof PollarLinkError) {
        return apiError(linkErrorMessage(err.reason), 409);
      }
      throw err;
    }

    const { user } = linked;
    if (user.status !== "active") {
      return apiError("Cuenta suspendida", 403);
    }

    const role = normalizeUserRole(user.type);
    if (!role) {
      return apiError(
        "Error de autenticación: rol de cuenta no válido; contacte al administrador",
        403
      );
    }

    // Empresa sin perfil público completo: el alta va primero y `from` se ignora.
    const needsBusinessProfile = requiresBusinessProfile(user);
    const redirectTo = needsBusinessProfile
      ? BUSINESS_ONBOARDING_PATH
      : (sanitizeAuthReturnPath(parsed.data.from, role) ??
        defaultHomeForRole(role));

    const responseBody: AuthResponse = {
      message: "Inicio de sesión exitoso",
      user: toPublicUserDTO(user),
      role,
      redirectTo,
      ...(needsBusinessProfile ? { requiresBusinessProfile: true } : {}),
    };

    let token: string;
    try {
      token = await createSessionToken({ userId: user.user_id, role });
    } catch {
      return apiError(
        "Error de autenticación: servidor sin AUTH_SECRET válido",
        500
      );
    }

    await registerPollarExternalUser({
      externalId: user.user_id,
      email: user.email,
    });

    const res = apiSuccess(responseBody);
    attachSessionCookie(res, token);
    return res;
  } catch (err) {
    const infra = logAndRespondAuthInfrastructureError(
      "[api/auth/pollar/session]",
      err
    );
    if (infra) return infra;
    return apiError("Error de autenticación: error interno", 500);
  }
}
