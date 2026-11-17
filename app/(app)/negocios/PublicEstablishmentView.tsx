"use client";

import { useSyncExternalStore, type ReactNode } from "react";

import {
  IconClock,
  IconExternal,
  IconGlobe,
  IconMapPin,
  IconNavigation,
  IconPhone,
} from "src/components/profile/icons";
import { initialOf } from "src/components/profile/ui";
import {
  formatStoredHours,
  parseWeekHours,
  weekdayLabel,
  WEEKDAY_KEYS,
  type WeekdayKey,
  type WeekHours,
} from "src/lib/establishment/hours";
import type { EstablishmentProfile } from "src/lib/establishment/types";

function text(value: string | null): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function mapHref(profile: EstablishmentProfile): string | null {
  if (!profile.location_x || !profile.location_y) return null;
  const x = profile.location_x;
  const y = profile.location_y;
  return `https://www.openstreetmap.org/?mlat=${encodeURIComponent(y)}&mlon=${encodeURIComponent(x)}#map=17/${encodeURIComponent(y)}/${encodeURIComponent(x)}`;
}

function websiteHref(website: string): string {
  if (/^https?:\/\//i.test(website)) return website;
  return `https://${website}`;
}

function websiteLabel(website: string): string {
  return website.replace(/^https?:\/\//i, "").replace(/\/$/, "");
}

/** `Date.getDay()` empieza en domingo. */
const DAY_FROM_JS: WeekdayKey[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

function minutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function isOpenAt(week: WeekHours, now: Date): boolean {
  const today = DAY_FROM_JS[now.getDay()]!;
  const yesterday = DAY_FROM_JS[(now.getDay() + 6) % 7]!;
  const current = now.getHours() * 60 + now.getMinutes();
  const day = week[today];
  if (!day.closed) {
    const open = minutes(day.open);
    const close = minutes(day.close);
    if (close > open ? current >= open && current < close : current >= open) {
      return true;
    }
  }
  const prev = week[yesterday];
  if (!prev.closed && minutes(prev.close) <= minutes(prev.open)) {
    return current < minutes(prev.close);
  }
  return false;
}

function subscribeToMinutes(onChange: () => void) {
  const id = window.setInterval(onChange, 60_000);
  return () => window.clearInterval(id);
}

/** Solo en el cliente: el servidor no conoce la zona horaria del visitante. */
function useToday(hours: string | null) {
  const minute = useSyncExternalStore(
    subscribeToMinutes,
    () => Math.floor(Date.now() / 60_000),
    () => null
  );
  if (minute === null || !hours?.trim().startsWith("{")) return null;
  const now = new Date(minute * 60_000);
  return {
    today: DAY_FROM_JS[now.getDay()]!,
    open: isOpenAt(parseWeekHours(hours), now),
  };
}

export function PublicEstablishmentView({
  profile,
  titleId,
  visits,
}: {
  profile: EstablishmentProfile;
  titleId?: string;
  visits?: number;
}) {
  const map = mapHref(profile);
  const category = text(profile.category);
  const description = text(profile.description);
  const address = text(profile.address);
  const phone = text(profile.phone);
  const website = text(profile.website);
  const structuredHours = profile.hours?.trim().startsWith("{")
    ? parseWeekHours(profile.hours)
    : null;
  const freeHours = structuredHours ? null : formatStoredHours(profile.hours);
  const todayState = useToday(profile.hours);
  const cover = profile.images[0]?.url ?? null;
  const hasLocation =
    Boolean(profile.location_x) ||
    Boolean(profile.location_y) ||
    Boolean(profile.location_z);

  return (
    <article>
      <div className="relative h-40 overflow-hidden bg-tonki-chrome sm:h-48">
        {cover ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={cover} alt="" className="h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-tonki-chrome/80 via-tonki-chrome/20 to-transparent" />
          </>
        ) : (
          <>
            <div className="tonki-hex-dark absolute inset-0" />
            <div className="absolute -right-16 -top-20 h-64 w-64 rounded-full bg-tonki-accent/30 blur-3xl" />
            <div className="absolute -bottom-24 left-0 h-48 w-48 rounded-full bg-tonki-cta/35 blur-3xl" />
          </>
        )}
      </div>

      <div className="relative px-5 pb-6 sm:px-7">
        <div className="-mt-12 flex items-start justify-between gap-3">
          <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-3xl bg-white shadow-[0_12px_28px_-12px_rgba(45,33,13,0.55)] ring-4 ring-tonki-canvas">
            {profile.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profile.avatar_url}
                alt={`Logo de ${profile.name}`}
                className="h-full w-full object-contain p-2"
              />
            ) : (
              <span className="flex h-full w-full items-center justify-center bg-tonki-chrome text-4xl font-bold text-tonki-accent">
                {initialOf(profile.name)}
              </span>
            )}
          </div>
          <div className="mt-[60px] flex flex-col items-center justify-center bg-tonki-accent px-4 py-2 text-tonki-accent-fg [clip-path:polygon(12%_0,88%_0,100%_50%,88%_100%,12%_100%,0_50%)]">
            <span className="text-xl font-bold leading-none tabular-nums">
              {profile.cashback_percent}%
            </span>
            <span className="mt-0.5 text-[10px] font-bold uppercase tracking-wider">
              en Tonkis
            </span>
          </div>
        </div>

        <h2
          id={titleId}
          className="mt-4 text-2xl font-bold leading-tight tracking-tight text-tonki-text sm:text-[28px]"
        >
          {profile.name}
        </h2>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {category ? (
            <span className="rounded-full bg-tonki-chrome px-3 py-1 text-xs font-semibold text-tonki-chrome-text-secondary">
              {category}
            </span>
          ) : null}
          {todayState ? (
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${
                todayState.open
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-tonki-surface-hover text-tonki-text-muted"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  todayState.open ? "bg-emerald-500" : "bg-tonki-text-faint"
                }`}
              />
              {todayState.open ? "Abierto ahora" : "Cerrado ahora"}
            </span>
          ) : null}
          {visits ? (
            <span className="rounded-full bg-tonki-accent px-3 py-1 text-xs font-bold text-tonki-accent-fg">
              Visitaste {visits} {visits === 1 ? "vez" : "veces"}
            </span>
          ) : null}
        </div>

        {description ? (
          <p className="mt-4 whitespace-pre-wrap text-[15px] leading-relaxed text-tonki-text-secondary">
            {description}
          </p>
        ) : null}

        {phone || website || map ? (
          <div className="mt-5 flex gap-2">
            {phone ? (
              <ActionButton href={`tel:${phone}`} icon={<IconPhone className="h-4 w-4" />} primary>
                Llamar
              </ActionButton>
            ) : null}
            {map ? (
              <ActionButton href={map} external icon={<IconNavigation className="h-4 w-4" />} primary={!phone}>
                Cómo llegar
              </ActionButton>
            ) : null}
            {website ? (
              <ActionButton href={websiteHref(website)} external icon={<IconGlobe className="h-4 w-4" />}>
                Sitio web
              </ActionButton>
            ) : null}
          </div>
        ) : null}

        {address || phone || website || hasLocation ? (
          <section aria-label="Datos de contacto" className="mt-6">
            <SectionTitle>Información</SectionTitle>
            <dl className="mt-3 divide-y divide-tonki-border/70 overflow-hidden rounded-2xl border border-tonki-border bg-white/60">
              {address ? (
                <InfoRow icon={<IconMapPin className="h-4 w-4" />} label="Dirección">
                  {address}
                </InfoRow>
              ) : null}
              {phone ? (
                <InfoRow icon={<IconPhone className="h-4 w-4" />} label="Teléfono">
                  <a className="font-semibold text-tonki-cta hover:underline" href={`tel:${phone}`}>
                    {phone}
                  </a>
                </InfoRow>
              ) : null}
              {website ? (
                <InfoRow icon={<IconGlobe className="h-4 w-4" />} label="Sitio web">
                  <a
                    className="break-all font-semibold text-tonki-cta hover:underline"
                    href={websiteHref(website)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {websiteLabel(website)}
                  </a>
                </InfoRow>
              ) : null}
              {hasLocation ? (
                <InfoRow icon={<IconNavigation className="h-4 w-4" />} label="Ubicación X, Y, Z">
                  <span className="tabular-nums">
                    {profile.location_x ?? "—"}, {profile.location_y ?? "—"},{" "}
                    {profile.location_z ?? "—"}
                  </span>
                  {map ? (
                    <a
                      href={map}
                      target="_blank"
                      rel="noreferrer"
                      className="ml-2 inline-flex items-center gap-1 font-semibold text-tonki-cta hover:underline"
                    >
                      Ver mapa
                      <IconExternal className="h-3.5 w-3.5" />
                    </a>
                  ) : null}
                </InfoRow>
              ) : null}
            </dl>
          </section>
        ) : null}

        {structuredHours || freeHours ? (
          <section aria-label="Horario" className="mt-6">
            <SectionTitle>
              <IconClock className="h-3.5 w-3.5" />
              Horario
            </SectionTitle>
            {structuredHours ? (
              <ul className="mt-3 overflow-hidden rounded-2xl border border-tonki-border bg-white/60">
                {WEEKDAY_KEYS.map((key) => {
                  const day = structuredHours[key];
                  const isToday = todayState?.today === key;
                  return (
                    <li
                      key={key}
                      className={`flex items-center justify-between px-4 py-2.5 text-sm ${
                        isToday ? "bg-tonki-accent/25 font-bold" : ""
                      }`}
                    >
                      <span className="flex items-center gap-2 text-tonki-text">
                        {weekdayLabel(key)}
                        {isToday ? (
                          <span className="rounded-full bg-tonki-chrome px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-tonki-accent">
                            Hoy
                          </span>
                        ) : null}
                      </span>
                      <span
                        className={`tabular-nums ${
                          day.closed ? "text-tonki-text-faint" : "text-tonki-text-secondary"
                        }`}
                      >
                        {day.closed ? "Cerrado" : `${day.open} – ${day.close}`}
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="mt-3 whitespace-pre-line rounded-2xl border border-tonki-border bg-white/60 px-4 py-3 text-sm text-tonki-text-secondary">
                {freeHours}
              </p>
            )}
          </section>
        ) : null}

        {profile.images.length > 0 ? (
          <section aria-label="Fotos" className="mt-6">
            <SectionTitle>Fotos</SectionTitle>
            <ul className="mt-3 grid grid-cols-3 gap-2">
              {profile.images.map((image, index) => (
                <li
                  key={image.image_id}
                  className={`overflow-hidden rounded-2xl bg-tonki-surface-hover ${
                    index === 0 && profile.images.length > 2
                      ? "col-span-2 row-span-2"
                      : ""
                  }`}
                >
                  <a href={image.url} target="_blank" rel="noreferrer" className="block aspect-square h-full w-full">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={image.url}
                      alt=""
                      className="h-full w-full object-cover transition duration-300 hover:scale-105"
                    />
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </article>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h3 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-tonki-text-faint">
      {children}
    </h3>
  );
}

function ActionButton({
  href,
  icon,
  external,
  primary,
  children,
}: {
  href: string;
  icon: ReactNode;
  external?: boolean;
  primary?: boolean;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noreferrer" : undefined}
      className={`inline-flex h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-xl px-3 text-sm font-bold transition ${
        primary
          ? "bg-tonki-accent text-tonki-accent-fg hover:bg-tonki-accent-hover"
          : "border border-tonki-border-strong bg-white/60 text-tonki-text hover:border-tonki-accent hover:bg-tonki-accent/15"
      }`}
    >
      {icon}
      {children}
    </a>
  );
}

function InfoRow({
  icon,
  label,
  children,
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex gap-3 px-4 py-3">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-tonki-chrome text-tonki-accent">
        {icon}
      </span>
      <div className="min-w-0">
        <dt className="text-[11px] font-semibold uppercase tracking-wide text-tonki-text-faint">
          {label}
        </dt>
        <dd className="mt-0.5 text-sm text-tonki-text">{children}</dd>
      </div>
    </div>
  );
}
