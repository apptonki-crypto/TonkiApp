import { redirect } from "next/navigation";

import prisma from "src/lib/db";
import { getSessionFromCookies } from "src/lib/auth/session";
import {
  BUSINESS_ONBOARDING_PATH,
  requiresBusinessProfile,
} from "src/lib/auth/businessProfile";

/**
 * Para layouts de servidor: si la sesión es de una empresa sin perfil completo,
 * manda al alta. Sin sesión (p. ej. /negocios público) no hace nada.
 */
export async function redirectIfBusinessProfileMissing(): Promise<void> {
  const session = await getSessionFromCookies();
  if (!session || session.role !== "admin") return;

  const user = await prisma.user.findUnique({
    where: { user_id: session.userId },
    select: { type: true, business_profile_completed_at: true },
  });
  if (user && requiresBusinessProfile(user)) {
    redirect(BUSINESS_ONBOARDING_PATH);
  }
}
