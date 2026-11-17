import { AccountSlideOverGroup } from "src/components/AccountSlideOver";
import { AppHeader } from "src/components/AppHeader";
import { BottomNavbar } from "src/components/BottomNavbar";
import { redirectIfBusinessProfileMissing } from "src/lib/auth/businessProfileGate";

/**
 * Layout compartido para las rutas con navegación inferior (/dashboard, /rewards, /account).
 * - Provee la cabecera de marca y el panel de cuenta a todas las vistas (cohesión visual).
 * - Reserva espacio al fondo (alto de la barra + Safe Area) para que la navbar fija no tape el contenido.
 * - Una empresa sin perfil completo va al alta obligatoria antes de ver cualquier vista.
 */
export default async function AppShellLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await redirectIfBusinessProfileMissing();
  return (
    <AccountSlideOverGroup>
      <div className="min-h-screen bg-tonki-canvas text-tonki-text pb-[calc(72px+env(safe-area-inset-bottom))]">
        <AppHeader />
        {children}
        <BottomNavbar />
      </div>
    </AccountSlideOverGroup>
  );
}
