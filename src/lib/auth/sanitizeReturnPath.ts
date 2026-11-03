import { isChargeToken } from "src/lib/charges/constants";
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
    pathOnly.startsWith("/onboarding")
  ) {
    return pathOnly;
  }
  return null;
}
