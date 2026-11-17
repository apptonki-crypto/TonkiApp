import { redirect } from "next/navigation";

import { requiresBusinessProfile } from "src/lib/auth/businessProfile";
import { getSessionFromCookies } from "src/lib/auth/session";
import prisma from "src/lib/db";

import { BusinessOnboardingClient } from "./BusinessOnboardingClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Perfil de tu empresa — Tonki",
};

/**
 * Alta obligatoria de la empresa, una sola vez tras el primer ingreso con
 * Pollar. Solo cuentas `admin` sin el perfil completado la ven.
 */
export default async function BusinessOnboardingPage() {
  const session = await getSessionFromCookies();
  if (!session) redirect("/login?from=%2Fonboarding%2Fempresa");
  if (session.role !== "admin") redirect("/dashboard");

  const user = await prisma.user.findUnique({
    where: { user_id: session.userId },
    select: { type: true, business_profile_completed_at: true },
  });
  if (!user || user.type !== "admin") redirect("/dashboard");
  if (!requiresBusinessProfile(user)) redirect("/admin/dashboard");

  return <BusinessOnboardingClient />;
}
