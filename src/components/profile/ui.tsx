import type { ReactNode } from "react";

import { IconCheck } from "./icons";

export const FIELD_CLASS =
  "h-12 w-full rounded-xl border border-tonki-border bg-white/70 px-4 text-[15px] text-tonki-text outline-none transition placeholder:text-tonki-text-faint/70 hover:border-tonki-border-strong focus:border-tonki-accent focus:bg-white focus:ring-4 focus:ring-tonki-accent/25 disabled:opacity-50";

export const TEXTAREA_CLASS =
  "min-h-28 w-full resize-y rounded-xl border border-tonki-border bg-white/70 px-4 py-3 text-[15px] leading-relaxed text-tonki-text outline-none transition placeholder:text-tonki-text-faint/70 hover:border-tonki-border-strong focus:border-tonki-accent focus:bg-white focus:ring-4 focus:ring-tonki-accent/25";

export const PRIMARY_BUTTON_CLASS =
  "inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-tonki-accent px-6 text-[15px] font-bold text-tonki-accent-fg shadow-[0_6px_18px_-8px_rgba(157,77,3,0.55)] transition hover:-translate-y-px hover:bg-tonki-accent-hover active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0";

/** Hexágono de marca con un icono dentro. */
export function HexBadge({
  children,
  tone = "accent",
  className = "",
}: {
  children: ReactNode;
  tone?: "accent" | "chrome";
  className?: string;
}) {
  const colors =
    tone === "accent"
      ? "bg-tonki-accent text-tonki-accent-fg"
      : "bg-tonki-chrome text-tonki-accent";
  return (
    <span
      className={`flex h-10 w-10 shrink-0 items-center justify-center [clip-path:polygon(25%_4%,75%_4%,100%_50%,75%_96%,25%_96%,0_50%)] ${colors} ${className}`}
    >
      {children}
    </span>
  );
}

export function Panel({
  icon,
  title,
  description,
  action,
  children,
  className = "",
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-3xl border border-tonki-border bg-white/55 p-5 shadow-[0_1px_0_rgba(45,33,13,0.04),0_18px_40px_-28px_rgba(45,33,13,0.45)] sm:p-7 ${className}`}
    >
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {icon ? <HexBadge>{icon}</HexBadge> : null}
          <div className="min-w-0">
            <h2 className="text-lg font-bold tracking-tight text-tonki-text">
              {title}
            </h2>
            {description ? (
              <p className="mt-0.5 text-sm text-tonki-text-muted">
                {description}
              </p>
            ) : null}
          </div>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </header>
      {children}
    </section>
  );
}

export function Field({
  label,
  htmlFor,
  hint,
  optional,
  className = "",
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: ReactNode;
  optional?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={className}>
      <label
        htmlFor={htmlFor}
        className="mb-1.5 flex items-baseline justify-between gap-2 text-sm font-semibold text-tonki-text"
      >
        {label}
        {optional ? (
          <span className="text-xs font-normal text-tonki-text-faint">
            Opcional
          </span>
        ) : null}
      </label>
      {children}
      {hint ? (
        <p className="mt-1.5 text-xs text-tonki-text-faint">{hint}</p>
      ) : null}
    </div>
  );
}

export function Notice({
  tone,
  children,
}: {
  tone: "error" | "success";
  children: ReactNode;
}) {
  if (tone === "error") {
    return (
      <p
        role="alert"
        className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-tonki-danger"
      >
        {children}
      </p>
    );
  }
  return (
    <p
      role="status"
      className="flex items-center gap-2 rounded-2xl border border-tonki-accent/50 bg-tonki-accent/15 px-4 py-3 text-sm font-semibold text-tonki-text"
    >
      <IconCheck className="h-4 w-4 shrink-0 text-tonki-cta" />
      {children}
    </p>
  );
}

export function initialOf(name: string | null | undefined): string {
  return name?.trim().charAt(0).toUpperCase() || "?";
}
