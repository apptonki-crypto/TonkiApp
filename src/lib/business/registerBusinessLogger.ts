/**
 * Structured logging for the business registration flow. Never pass raw
 * request bodies or passwords here — only stage names and safe metadata.
 */

export type BusinessRegisterStage =
  | "secret_check"
  | "parse_body"
  | "validation"
  | "user_lookup"
  | "credential_lookup"
  | "password_hash"
  | "create_user"
  | "create_credential"
  | "create_establishment"
  | "unknown";

/** Wraps a lower-level error with the stage of the register flow that raised it. */
export class BusinessRegisterStageError extends Error {
  readonly stage: BusinessRegisterStage;
  readonly cause: unknown;

  constructor(stage: BusinessRegisterStage, cause: unknown) {
    const causeMessage = cause instanceof Error ? cause.message : String(cause);
    super(`[${stage}] ${causeMessage}`);
    this.name = "BusinessRegisterStageError";
    this.stage = stage;
    this.cause = cause;
  }
}

function prismaCode(err: unknown): string | undefined {
  const target =
    err instanceof BusinessRegisterStageError ? err.cause : err;
  if (target && typeof target === "object" && "code" in target) {
    return String((target as { code: unknown }).code);
  }
  return undefined;
}

function prismaMeta(err: unknown): unknown {
  const target =
    err instanceof BusinessRegisterStageError ? err.cause : err;
  if (target && typeof target === "object" && "meta" in target) {
    return (target as { meta: unknown }).meta;
  }
  return undefined;
}

/** Maps infra/schema errors to a short user-facing message (mainly in development). */
export function resolveBusinessRegisterInfrastructureError(
  err: unknown
): string | null {
  const cause = err instanceof BusinessRegisterStageError ? err.cause : err;
  const code = prismaCode(cause);
  const msg = cause instanceof Error ? cause.message : String(cause);
  const meta = prismaMeta(cause) as
    | { column?: string; modelName?: string }
    | undefined;

  if (code === "P2022") {
    const column = meta?.column?.split(".").pop() ?? "desconocida";
    const model = meta?.modelName ?? "tabla";
    return process.env.NODE_ENV === "development"
      ? `La base de datos está desactualizada: falta la columna \`${column}\` en ${model}. Ejecuta: npx prisma migrate deploy`
      : "El servidor no está configurado correctamente. Contacta a soporte.";
  }

  if (
    code === "P1001" ||
    code === "P1003" ||
    code === "P1017" ||
    /ECONNREFUSED|Can't reach database/i.test(msg)
  ) {
    return process.env.NODE_ENV === "development"
      ? "No hay conexión con MySQL. Revisa DATABASE_URL y que la base esté en marcha."
      : "Servicio temporalmente no disponible. Intenta más tarde.";
  }

  if (
    msg.includes("Environment variable not found: DATABASE_URL") ||
    (msg.includes("DATABASE_URL") && msg.includes("not found"))
  ) {
    return "Falta DATABASE_URL en la configuración del servidor.";
  }

  return null;
}

/**
 * Logs a single structured line per failure, safe to grep in production:
 * `[business-register] stage=create_establishment code=P2002 requestId=... email=a***@b.com message=...`
 */
export function logBusinessRegisterError(
  routeLabel: string,
  err: unknown,
  context: { requestId: string; email?: string; level?: "warn" | "error" }
): void {
  const stage =
    err instanceof BusinessRegisterStageError ? err.stage : "unknown";
  const cause = err instanceof BusinessRegisterStageError ? err.cause : err;
  const code = prismaCode(cause);
  const meta = prismaMeta(cause);
  const message = cause instanceof Error ? cause.message : String(cause);

  const fields: Record<string, unknown> = {
    stage,
    requestId: context.requestId,
  };
  if (context.email) fields.email = maskEmail(context.email);
  if (code) fields.code = code;
  if (meta) fields.meta = meta;
  fields.message = message;

  const log = context.level === "warn" ? console.warn : console.error;
  log(routeLabel, fields);

  if (cause instanceof Error && cause.stack && fields.level !== "warn") {
    console.error(routeLabel, "stack:", cause.stack);
  }
}

/** Logs a rejected request (bad secret, malformed JSON, validation) at warn level for abuse monitoring. */
export function logBusinessRegisterRejection(
  routeLabel: string,
  context: {
    requestId: string;
    stage: BusinessRegisterStage;
    reason: string;
    ip?: string | null;
  }
): void {
  console.warn(routeLabel, {
    stage: context.stage,
    requestId: context.requestId,
    reason: context.reason,
    ip: context.ip ?? undefined,
  });
}

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  const visible = local?.slice(0, 2) ?? "";
  return `${visible}***@${domain}`;
}
