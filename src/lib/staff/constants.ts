import type { UserRole } from "src/types/auth";

/** Inicio de la vista de mesero. */
export const STAFF_HOME_PATH = "/mesero";

/** Prefijo del enlace de invitación (lo abre un cliente aún no vinculado). */
export const STAFF_JOIN_PATH_PREFIX = "/mesero/unirse/";

/** Vigencia de una invitación de mesero. */
export const STAFF_INVITE_TTL_MS = 48 * 60 * 60 * 1000;

/** Ventana de "QR del turno" que ve el mesero. */
export const STAFF_SHIFT_WINDOW_MS = 12 * 60 * 60 * 1000;

export const STAFF_STATUS_ACTIVE = "active";
export const STAFF_STATUS_REVOKED = "revoked";

export const STAFF_INVITE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32}$/;

export function isStaffInviteToken(token: string): boolean {
  return STAFF_INVITE_TOKEN_PATTERN.test(token);
}

/** Ruta de inicio por rol después de iniciar sesión. */
export function defaultHomeForRole(role: UserRole): string {
  if (role === "admin") return "/admin/dashboard";
  if (role === "staff") return STAFF_HOME_PATH;
  return "/dashboard";
}
