import type { ReactNode } from "react";

import { formatStoredHours } from "src/lib/establishment/hours";
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

export function PublicEstablishmentView({
  profile,
}: {
  profile: EstablishmentProfile;
}) {
  const map = mapHref(profile);
  const initial = profile.name.trim().charAt(0).toUpperCase() || "?";
  const description = text(profile.description);
  const address = text(profile.address);
  const hours = formatStoredHours(profile.hours);
  const phone = text(profile.phone);
  const website = text(profile.website);

  return (
    <div className="space-y-5">
      <div className="flex h-44 items-center justify-center rounded-2xl bg-tonki-canvas p-4">
        {profile.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={profile.avatar_url}
            alt={`Logo de ${profile.name}`}
            className="max-h-full max-w-full object-contain"
          />
        ) : (
          <span className="text-4xl font-bold text-tonki-text-muted">
            {initial}
          </span>
        )}
      </div>

      <div>
        <h2 className="text-2xl font-bold tracking-tight text-tonki-text">
          {profile.name}
        </h2>
        <p className="mt-1 text-sm text-tonki-text-muted">
          {[profile.category, `${profile.cashback_percent}% en Tonkis`]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>

      {description ? (
        <p className="whitespace-pre-wrap text-base leading-relaxed text-tonki-text-secondary">
          {description}
        </p>
      ) : null}

      <dl className="grid gap-3">
        {address ? <Info label="Dirección" value={address} /> : null}
        {hours ? (
          <Info label="Horario">
            <span className="whitespace-pre-line">{hours}</span>
          </Info>
        ) : null}
        {phone ? (
          <Info label="Teléfono">
            <a className="text-tonki-accent" href={`tel:${phone}`}>
              {phone}
            </a>
          </Info>
        ) : null}
        {website ? (
          <Info label="Sitio">
            <a
              className="break-all text-tonki-accent"
              href={websiteHref(website)}
              target="_blank"
              rel="noreferrer"
            >
              {website}
            </a>
          </Info>
        ) : null}
        {profile.location_x || profile.location_y || profile.location_z ? (
          <Info label="Ubicación X, Y, Z">
            <span className="tabular-nums">
              {profile.location_x ?? "—"}, {profile.location_y ?? "—"},{" "}
              {profile.location_z ?? "—"}
            </span>
            {map ? (
              <>
                {" "}
                <a
                  href={map}
                  target="_blank"
                  rel="noreferrer"
                  className="font-semibold text-tonki-accent"
                >
                  Ver mapa
                </a>
              </>
            ) : null}
          </Info>
        ) : null}
      </dl>

      {profile.images.length > 0 ? (
        <section>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-tonki-text-muted">
            Fotos
          </h3>
          <ul className="mt-3 grid grid-cols-2 gap-3">
            {profile.images.map((image) => (
              <li
                key={image.image_id}
                className="flex h-40 items-center justify-center rounded-xl bg-tonki-canvas p-2"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={image.url}
                  alt=""
                  className="max-h-full max-w-full object-contain"
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function Info({
  label,
  value,
  children,
}: {
  label: string;
  value?: string;
  children?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-tonki-border bg-tonki-canvas px-4 py-3">
      <dt className="text-xs font-medium uppercase tracking-wide text-tonki-text-faint">
        {label}
      </dt>
      <dd className="mt-1 text-sm text-tonki-text">{children ?? value}</dd>
    </div>
  );
}
