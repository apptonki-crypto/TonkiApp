"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { AccountSlideOverTrigger } from "src/components/AccountSlideOver";

const ADMIN_LOGO = "/Logos-Tonki-SVG/Isotipo amarillo-crema.svg";

const ADMIN_NAV = [
  { href: "/admin/dashboard", label: "Contenido" },
  { href: "/admin/crm", label: "CRM ventas" },
  { href: "/admin/cobrar", label: "Cobrar" },
  { href: "/admin/presentacion", label: "QR del local" },
  { href: "/admin/meseros", label: "Meseros" },
] as const;

/**
 * Cabecera exclusiva del área admin (/admin/*).
 */
export function AdminHeader() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 print:hidden border-b border-tonki-chrome-border bg-tonki-chrome backdrop-blur-md">
      <div className="mx-auto flex w-full flex-col gap-2 px-4 py-3 sm:px-6">
        <div className="flex w-full items-center justify-between gap-4">
          <Link
            href="/admin/dashboard"
            className="flex shrink-0 items-center gap-2.5 text-tonki-chrome-text transition-colors hover:text-tonki-accent"
          >
            <img
              src={ADMIN_LOGO}
              alt="Tonki Admin"
              width={32}
              height={32}
              className="h-8 w-8"
            />
            <span className="text-lg font-bold tracking-tight">Tonki</span>
          </Link>

          <AccountSlideOverTrigger className="min-w-0 max-w-[min(200px,45vw)] shrink-0 truncate text-right text-sm font-medium text-tonki-chrome-text-muted transition-colors hover:text-tonki-chrome-text-secondary sm:text-base" />
        </div>

        <nav
          aria-label="Admin"
          className="-mx-1 flex gap-1 overflow-x-auto pb-0.5"
        >
          {ADMIN_NAV.map(({ href, label }) => {
            const active =
              pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors sm:text-sm ${
                  active
                    ? "bg-tonki-accent/15 text-tonki-accent"
                    : "text-tonki-chrome-text-muted hover:bg-tonki-chrome-hover hover:text-tonki-chrome-text-secondary"
                }`}
              >
                {label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
