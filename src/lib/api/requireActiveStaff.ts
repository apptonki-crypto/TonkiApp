import prisma from "src/lib/db";
import { apiError } from "src/lib/api/response";
import { getSessionUserId } from "src/lib/auth/session";
import { STAFF_STATUS_ACTIVE } from "src/lib/staff/constants";

/**
 * Sesión válida + usuario activo con `type === "staff"` + membresía activa
 * en un negocio activo. Relee BD: el rol del JWT puede estar viejo.
 */
export async function requireActiveStaffSession() {
  const userId = await getSessionUserId();
  if (!userId) {
    return { ok: false as const, response: apiError("No autenticado", 401) };
  }

  const user = await prisma.user.findUnique({
    where: { user_id: userId },
    select: {
      name: true,
      status: true,
      type: true,
      staff_membership: {
        select: {
          status: true,
          admin_id: true,
          establishment_id: true,
          admin: { select: { status: true, type: true } },
        },
      },
    },
  });

  if (!user || user.status !== "active") {
    return { ok: false as const, response: apiError("Cuenta suspendida", 403) };
  }

  const membership = user.staff_membership;
  if (
    user.type !== "staff" ||
    !membership ||
    membership.status !== STAFF_STATUS_ACTIVE
  ) {
    return {
      ok: false as const,
      response: apiError("Ya no eres mesero de este negocio.", 403),
    };
  }

  if (membership.admin.status !== "active" || membership.admin.type !== "admin") {
    return {
      ok: false as const,
      response: apiError("El negocio no está activo.", 403),
    };
  }

  return {
    ok: true as const,
    userId,
    staffName: user.name,
    adminId: membership.admin_id,
    establishmentId: membership.establishment_id,
  };
}
