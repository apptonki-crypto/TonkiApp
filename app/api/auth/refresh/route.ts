import { NextResponse } from "next/server";

import prisma from "src/lib/db";
import {
  attachSessionCookie,
  clearSessionCookie,
  createSessionToken,
  verifySession,
} from "src/lib/auth/session";
import { normalizeUserRole } from "src/lib/auth/userRole";
import { defaultHomeForRole } from "src/lib/staff/constants";

/**
 * Re-emite la cookie con el rol actual de BD y manda al inicio de ese rol.
 * Se usa cuando el rol del JWT quedó viejo (p. ej. a un mesero lo revocaron
 * y volvió a ser cliente), para no caer en un bucle de redirecciones.
 */
export async function GET(req: Request) {
  const session = await verifySession(req);
  const loginUrl = new URL("/login", req.url);
  if (!session) return NextResponse.redirect(loginUrl);

  const user = await prisma.user.findUnique({
    where: { user_id: session.userId },
    select: { user_id: true, type: true, status: true },
  });
  const role = user ? normalizeUserRole(user.type) : null;
  if (!user || user.status !== "active" || !role) {
    const res = NextResponse.redirect(loginUrl);
    clearSessionCookie(res);
    return res;
  }

  const res = NextResponse.redirect(new URL(defaultHomeForRole(role), req.url));
  attachSessionCookie(
    res,
    await createSessionToken({ userId: user.user_id, role })
  );
  return res;
}
