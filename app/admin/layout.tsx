import { AccountSlideOverGroup } from "src/components/AccountSlideOver";
import { BottomNavbar } from "src/components/BottomNavbar";
import { redirectIfBusinessProfileMissing } from "src/lib/auth/businessProfileGate";

import { AdminHeader } from "./AdminHeader";

/**
 * Layout compartido para rutas de administrador (/admin/dashboard, /admin/airdrop, …).
 * Incluye cabecera admin propia (no AppHeader del feed).
 * Una empresa sin perfil completo no pasa de aquí: va al alta obligatoria.
 */
export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await redirectIfBusinessProfileMissing();
  return (
    <AccountSlideOverGroup>
      <div className="min-h-screen bg-tonki-canvas text-tonki-text pb-[calc(72px+env(safe-area-inset-bottom))]">
        <AdminHeader />
        {children}
        <BottomNavbar />
      </div>
    </AccountSlideOverGroup>
  );
}
