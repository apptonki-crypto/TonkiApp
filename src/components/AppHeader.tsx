"use client";

import { FallbackNextImage } from "src/components/FallbackNextImage";
import Link from "next/link";

import { AccountSlideOverTrigger } from "src/components/AccountSlideOver";

/**
 * Cabecera compartida para las páginas internas (feed, recompensas, cuenta).
 */
export function AppHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-tonki-chrome-border bg-tonki-chrome/95 backdrop-blur-md">
      <div className="mx-auto flex w-full items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link
          href="/dashboard"
          className="flex shrink-0 items-center gap-2.5 text-tonki-chrome-text transition-colors hover:text-tonki-accent"
        >
          <FallbackNextImage src="/logo.png" alt="Tonki" width={32} height={32} priority />
          <span className="text-lg font-bold tracking-tight">Tonki</span>
        </Link>

        <AccountSlideOverTrigger className="min-w-0 max-w-[min(200px,45vw)] shrink-0 truncate text-right text-sm font-medium text-tonki-chrome-text-muted transition-colors hover:text-tonki-chrome-text-secondary sm:text-base" />
      </div>
    </header>
  );
}
