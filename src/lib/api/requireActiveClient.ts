import prisma from "src/lib/db";
import { apiError } from "src/lib/api/response";
import { getSessionFromCookies } from "src/lib/auth/session";

/**
 * Sesión válida + cuenta activa con `type === "user"`.
 * Un admin no participa en dinámicas de cliente.
 */
export async function requireActiveClientSession() {
  const session = await getSessionFromCookies();
  if (!session) {
    return { ok: false as const, response: apiError("No autenticado", 401) };
  }

  const user = await prisma.user.findUnique({
    where: { user_id: session.userId },
    select: { status: true, type: true },
  });

  if (!user || user.status !== "active") {
    return { ok: false as const, response: apiError("Cuenta suspendida", 403) };
  }

  if (user.type !== "user") {
    return {
      ok: false as const,
      response: apiError("Una cuenta de administrador no puede participar.", 403),
    };
  }

  return { ok: true as const, userId: session.userId };
}
