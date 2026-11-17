/** Ruta del alta obligatoria de empresa. */
export const BUSINESS_ONBOARDING_PATH = "/onboarding/empresa";

/**
 * Solo las cuentas de empresa (`admin`) sin la marca de perfil completado
 * deben pasar por el alta. Los clientes nunca.
 */
export function requiresBusinessProfile(user: {
  type: string;
  business_profile_completed_at: Date | null;
}): boolean {
  return user.type === "admin" && user.business_profile_completed_at === null;
}
