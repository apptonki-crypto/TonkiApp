"use client";

import { useEffect, useState } from "react";
import { PRESENTACION_NAV } from "./nav-items";

export function PresentacionNav() {
  const [activeId, setActiveId] = useState<string>(PRESENTACION_NAV[0].id);

  useEffect(() => {
    const pick = () => {
      const line = 96;
      let current: string = PRESENTACION_NAV[0].id;
      for (const item of PRESENTACION_NAV) {
        const section = document.getElementById(item.id);
        if (!section) continue;
        if (section.getBoundingClientRect().top <= line) current = item.id;
      }
      setActiveId(current);
    };

    pick();
    window.addEventListener("scroll", pick, { passive: true });
    window.addEventListener("hashchange", pick);
    return () => {
      window.removeEventListener("scroll", pick);
      window.removeEventListener("hashchange", pick);
    };
  }, []);

  return (
    <header className="sticky top-0 z-40 border-b border-tonki-chrome-border bg-tonki-chrome/95 text-tonki-chrome-text backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-7xl items-center gap-4 px-4 py-3 sm:px-6">
        <a href="/" className="flex shrink-0 items-center gap-2.5">
          <img
            src="/Logos-Tonki-SVG/Isotipo%20amarillo-crema.svg"
            alt=""
            width={36}
            height={36}
            className="h-9 w-9"
          />
          <span className="text-base font-bold tracking-tight">Tonki</span>
        </a>
        <nav
          aria-label="Secciones de la presentación"
          className="flex min-w-0 flex-1 gap-1 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {PRESENTACION_NAV.map((item) => {
            const active = activeId === item.id;
            return (
              <a
                key={item.id}
                href={`#${item.id}`}
                aria-current={active ? "true" : undefined}
                className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-semibold transition-colors ${
                  active
                    ? "bg-tonki-accent text-tonki-accent-fg"
                    : "text-tonki-chrome-text-secondary hover:bg-tonki-chrome-hover hover:text-tonki-chrome-text"
                }`}
              >
                {item.label}
              </a>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
