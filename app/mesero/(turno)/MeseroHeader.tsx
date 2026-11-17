"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

import { usePollarLogout } from "src/components/PollarAppProvider";
import { clearTonkiSession } from "src/lib/auth/clearTonkiSession";

const LOGO = "/Logos-Tonki-SVG/Isotipo amarillo-crema.svg";

export function MeseroHeader({ establishmentName }: { establishmentName: string }) {
  const router = useRouter();
  const logoutPollar = usePollarLogout();
  const [busy, setBusy] = useState(false);

  const handleLogout = useCallback(async () => {
    setBusy(true);
    try {
      logoutPollar();
      await clearTonkiSession();
      router.replace("/login");
      router.refresh();
    } catch {
      setBusy(false);
    }
  }, [logoutPollar, router]);

  return (
    <header className="sticky top-0 z-40 border-b border-tonki-chrome-border bg-tonki-chrome backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-2.5 text-tonki-chrome-text">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={LOGO} alt="Tonki" width={32} height={32} className="h-8 w-8 shrink-0" />
          <div className="min-w-0">
            <p className="truncate text-base font-bold leading-tight">{establishmentName}</p>
            <p className="text-xs text-tonki-chrome-text-muted">Modo mesero</p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          disabled={busy}
          className="shrink-0 rounded-lg px-3 py-1.5 text-sm font-semibold text-tonki-chrome-text-muted transition-colors hover:bg-tonki-chrome-hover hover:text-tonki-chrome-text-secondary disabled:opacity-50"
        >
          {busy ? "Cerrando…" : "Cerrar sesión"}
        </button>
      </div>
    </header>
  );
}
