import { isChargeToken } from "src/lib/charges/constants";
import {
  isStaffInviteToken,
  STAFF_HOME_PATH,
  STAFF_JOIN_PATH_PREFIX,
} from "src/lib/staff/constants";
import type { UserRole } from "src/types/auth";

/**
 * Safe in-app path after login / OAuth. Rejects protocol-relative URLs,
 * query/hash, and destinations outside the authenticated app.
 */
export function sanitizeAuthReturnPath(
  raw: string | null | undefined,
  role: UserRole
): string | null {
  if (!raw?.trim()) return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw.trim());
  } catch {
    return null;
  }
  const pathOnly = decoded.split(/[?#]/, 1)[0] ?? "";
  if (
    pathOnly.startsWith("//") ||
    !pathOnly.startsWith("/") ||
    pathOnly === "/login"
  ) {
    return null;
  }
  if (/[\x00-\x1f]/.test(pathOnly)) return null;
  if (!/^\/[-\w./]*$/.test(pathOnly)) return null;

  // El enlace de invitación lo abre un cliente que todavía no es mesero.
  if (pathOnly.startsWith(STAFF_JOIN_PATH_PREFIX)) {
    const token = pathOnly.slice(STAFF_JOIN_PATH_PREFIX.length);
    return isStaffInviteToken(token) ? pathOnly : null;
  }
  if (pathOnly === STAFF_HOME_PATH || pathOnly.startsWith(`${STAFF_HOME_PATH}/`)) {
    return role === "staff" ? pathOnly : null;
  }
  // Un mesero solo usa su vista; el resto cae a su inicio por defecto.
  if (role === "staff") return null;

  if (pathOnly.startsWith("/admin")) {
    return role === "admin" ? pathOnly : null;
  }
  if (pathOnly.startsWith("/cobro/")) {
    const token = pathOnly.slice("/cobro/".length);
    return isChargeToken(token) ? pathOnly : null;
  }
  if (pathOnly.startsWith("/dinamica/")) {
    const token = pathOnly.slice("/dinamica/".length);
    return isChargeToken(token) ? pathOnly : null;
  }
  if (
    pathOnly.startsWith("/dashboard") ||
    pathOnly.startsWith("/account") ||
    pathOnly === "/onboarding/empresa" ||
    pathOnly.startsWith("/onboarding/empresa/")
  ) {
    return pathOnly;
  }
  return null;
}
