/**
 * Sanitized Google OAuth error logging (no secrets, no public HTTP surface).
 */

export function sanitizeErrorMessage(err: unknown): {
  errName: string | null;
  errMessage: string | null;
  prismaCode: string | null;
} {
  const errName = err instanceof Error ? err.name : null;
  let errMessage = err instanceof Error ? err.message : String(err);
  errMessage = errMessage.replace(/[A-Za-z0-9_-]{40,}/g, "[redacted]");
  if (errMessage.length > 180) errMessage = `${errMessage.slice(0, 180)}…`;

  let prismaCode: string | null = null;
  if (err && typeof err === "object" && "code" in err) {
    prismaCode = String((err as { code: unknown }).code);
  }

  return { errName, errMessage, prismaCode };
}

export function logGoogleOAuthFailure(entry: {
  stage: string;
  errorCode: string;
  errName: string | null;
  errMessage: string | null;
  prismaCode: string | null;
}): void {
  console.warn("[google-oauth]", entry.stage, entry.errorCode, {
    errName: entry.errName,
    errMessage: entry.errMessage,
    prismaCode: entry.prismaCode,
  });
}
