import { redirect } from "next/navigation";

import prisma from "src/lib/db";
import { getSessionFromCookies } from "src/lib/auth/session";
import { STAFF_STATUS_ACTIVE } from "src/lib/staff/constants";

import { MeseroHeader } from "./MeseroHeader";

/**
 * Vista del mesero: solo generar QR y ver los del turno.
 * Relee BD: si lo dieron de baja, el JWT sigue diciendo "staff" y
 * `/api/auth/refresh` corrige la cookie antes de mandarlo a su inicio.
 */
export default async function MeseroLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await getSessionFromCookies();
  if (!session) redirect("/login?from=/mesero");

  const user = await prisma.user.findUnique({
    where: { user_id: session.userId },
    select: {
      type: true,
      status: true,
      staff_membership: {
        select: { status: true, establishment: { select: { name: true } } },
      },
    },
  });
  const membership = user?.staff_membership;
  if (!user || user.status !== "active" || user.type !== "staff") {
    redirect("/api/auth/refresh");
  }
  // Rol "staff" sin membresía activa (p. ej. editado a mano en BD): refrescar la
  // sesión volvería a mandar aquí, así que se explica en vez de redirigir en bucle.
  if (membership?.status !== STAFF_STATUS_ACTIVE) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-tonki-canvas px-4 text-tonki-text">
        <p className="max-w-sm text-center text-sm text-tonki-text-secondary">
          Tu cuenta de mesero no está vinculada a ningún negocio. Pide al negocio una
          invitación nueva.
        </p>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-tonki-canvas text-tonki-text">
      <MeseroHeader establishmentName={membership.establishment.name} />
      {children}
    </div>
  );
}
