"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";

import {
  IconCamera,
  IconClock,
  IconExternal,
  IconHex,
  IconMapPin,
  IconPhone,
  IconStore,
} from "src/components/profile/icons";
import {
  FIELD_CLASS,
  Field,
  Notice,
  Panel,
  PRIMARY_BUTTON_CLASS,
  TEXTAREA_CLASS,
  initialOf,
} from "src/components/profile/ui";
import { readJsonSafely } from "src/lib/api/readJsonSafely";
import { hasOpenHours } from "src/lib/establishment/hours";
import type { EstablishmentProfile } from "src/lib/establishment/types";

import { BusinessHoursField } from "./BusinessHoursField";
import { EstablishmentGalleryEditor } from "./EstablishmentGalleryEditor";

type EstablishmentResponse =
  | {
      success: true;
      message?: string;
      establishment: EstablishmentProfile | null;
    }
  | { success: false; error?: string };

type BusinessFormState = {
  name: string;
  address: string;
  category: string;
  description: string;
  phone: string;
  website: string;
  hours: string;
  location_x: string;
  location_y: string;
  location_z: string;
  cashback_percent: string;
};

const CASHBACK_PRESETS = [3, 5, 10, 15] as const;
const DESCRIPTION_MAX = 4000;

function formFromEstablishment(
  establishment: EstablishmentProfile | null
): BusinessFormState {
  return {
    name: establishment?.name ?? "",
    address: establishment?.address ?? "",
    category: establishment?.category ?? "",
    description: establishment?.description ?? "",
    phone: establishment?.phone ?? "",
    website: establishment?.website ?? "",
    hours: establishment?.hours ?? "",
    location_x: establishment?.location_x ?? "",
    location_y: establishment?.location_y ?? "",
    location_z: establishment?.location_z ?? "",
    cashback_percent: String(establishment?.cashback_percent ?? 5),
  };
}

type BusinessProfileSectionProps = {
  /**
   * `onboarding`: alta obligatoria de la empresa (una sola vez). Pide los datos
   * de la ficha pública, guarda con la ruta de alta y no ofrece atajos.
   */
  mode?: "account" | "onboarding";
  onCompleted?: () => void;
};

export function BusinessProfileSection({
  mode = "account",
  onCompleted,
}: BusinessProfileSectionProps = {}) {
  const onboarding = mode === "onboarding";
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [establishment, setEstablishment] = useState<EstablishmentProfile | null>(
    null
  );
  const [form, setForm] = useState<BusinessFormState>(formFromEstablishment(null));
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/establishment", { credentials: "include" });
        const data = await readJsonSafely<EstablishmentResponse>(res);
        if (cancelled) return;
        if (!res.ok || !data?.success) {
          setError(
            data && "error" in data && data.error
              ? data.error
              : "No se pudo cargar el negocio"
          );
          setLoading(false);
          return;
        }
        setEstablishment(data.establishment);
        setForm(formFromEstablishment(data.establishment));
        setPhotoPreview(data.establishment?.avatar_url ?? null);
        setLoaded(true);
      } catch {
        if (!cancelled) setError("No se pudo cargar el negocio");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (photoPreview?.startsWith("blob:")) {
        URL.revokeObjectURL(photoPreview);
      }
    };
  }, [photoPreview]);

  const handlePhotoChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreview((prev) => {
      if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
    setError(null);
    setSuccess(null);
  }, []);

  const handleSubmit = useCallback(
    async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      setError(null);
      setSuccess(null);
      if (onboarding && !hasOpenHours(form.hours)) {
        setError("Indica al menos un día de horario abierto");
        return;
      }
      setSaving(true);
      try {
        const body = new FormData();
        body.set("name", form.name);
        body.set("address", form.address);
        body.set("category", form.category);
        body.set("description", form.description);
        body.set("phone", form.phone);
        body.set("website", form.website);
        body.set("hours", form.hours);
        body.set("location_x", form.location_x);
        body.set("location_y", form.location_y);
        body.set("location_z", form.location_z);
        body.set("cashback_percent", form.cashback_percent);
        if (photoFile) body.set("photo", photoFile);

        const res = await fetch(
          onboarding ? "/api/establishment/onboarding" : "/api/establishment",
          {
            method: onboarding ? "POST" : "PUT",
            credentials: "include",
            body,
          }
        );
        const data = await readJsonSafely<EstablishmentResponse>(res);
        if (!res.ok || !data?.success || !data.establishment) {
          setError(
            data && "error" in data && data.error
              ? data.error
              : "No se pudo guardar el negocio"
          );
          return;
        }
        setEstablishment(data.establishment);
        setForm(formFromEstablishment(data.establishment));
        setPhotoFile(null);
        setPhotoPreview(data.establishment.avatar_url);
        if (fileInputRef.current) fileInputRef.current.value = "";
        setSuccess(data.message ?? "Negocio actualizado");
        if (onboarding) onCompleted?.();
      } catch {
        setError("No se pudo guardar el negocio");
      } finally {
        setSaving(false);
      }
    },
    [form, photoFile, onboarding, onCompleted]
  );

  const exists = establishment !== null;
  const cashback = Number(form.cashback_percent);
  const mapHref =
    form.location_x.trim() && form.location_y.trim()
      ? `https://www.openstreetmap.org/?mlat=${encodeURIComponent(form.location_y.trim())}&mlon=${encodeURIComponent(form.location_x.trim())}#map=17/${encodeURIComponent(form.location_y.trim())}/${encodeURIComponent(form.location_x.trim())}`
      : null;

  const heading = (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-tonki-cta">
          {onboarding ? "Paso obligatorio" : "Perfil público"}
        </p>
        <h2 className="mt-1 text-2xl font-bold tracking-tight text-tonki-text">
          {onboarding ? "Datos de tu empresa" : "Tu negocio"}
        </h2>
        <p className="mt-1 max-w-xl text-sm text-tonki-text-muted">
          {onboarding
            ? "Esta información se muestra en la página pública de tu empresa. Solo la pedimos esta vez; después podrás editarla desde Cuenta."
            : exists
              ? "Actualiza el establecimiento que acredita Tonkis."
              : "Registra tu establecimiento para acreditar Tonkis a tus clientes."}
        </p>
      </div>
      {!onboarding && exists ? (
        <Link
          href={`/negocios?lugar=${establishment.establishment_id}`}
          className="inline-flex items-center gap-2 rounded-full border border-tonki-border-strong bg-white/60 px-4 py-2 text-sm font-semibold text-tonki-text transition hover:border-tonki-accent hover:bg-tonki-accent/20"
        >
          Ver perfil público
          <IconExternal className="h-4 w-4" />
        </Link>
      ) : null}
    </div>
  );

  if (loading) {
    return (
      <div className={`space-y-6 ${onboarding ? "mt-8" : ""}`}>
        {heading}
        <div className="h-72 animate-pulse rounded-3xl bg-tonki-surface-hover/50" />
        <div className="h-48 animate-pulse rounded-3xl bg-tonki-surface-hover/35" />
      </div>
    );
  }

  if (!loaded) {
    return (
      <div className={`space-y-6 ${onboarding ? "mt-8" : ""}`}>
        {heading}
        {error ? <Notice tone="error">{error}</Notice> : null}
      </div>
    );
  }

  return (
    <div className={`space-y-6 ${onboarding ? "mt-8" : ""}`}>
      {heading}

      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-6">
        <Panel
          icon={<IconStore className="h-5 w-5" />}
          title="Identidad"
          description="Lo primero que ven tus clientes."
        >
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="group relative h-28 w-28 shrink-0 overflow-hidden rounded-3xl border border-tonki-border bg-white shadow-sm transition hover:border-tonki-accent"
              aria-label={photoPreview ? "Cambiar logo" : "Subir logo"}
            >
              {photoPreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={photoPreview}
                  alt="Logo del negocio"
                  className="h-full w-full object-contain p-2"
                />
              ) : (
                <span className="flex h-full w-full items-center justify-center bg-tonki-chrome text-4xl font-bold text-tonki-accent">
                  {initialOf(form.name)}
                </span>
              )}
              <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-tonki-chrome/80 py-1.5 text-[11px] font-bold text-tonki-chrome-text opacity-0 backdrop-blur transition group-hover:opacity-100 group-focus-visible:opacity-100">
                <IconCamera className="h-3.5 w-3.5" />
                Cambiar
              </span>
            </button>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-tonki-text">Logo</p>
              <p className="mt-0.5 text-xs text-tonki-text-faint">
                Cuadrado y con fondo claro se ve mejor. JPG, PNG, GIF o WebP ·
                máx. 2 MB
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <label
                  htmlFor="business-photo"
                  className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-tonki-chrome px-4 py-2 text-sm font-semibold text-tonki-chrome-text transition hover:bg-tonki-chrome-elevated"
                >
                  <IconCamera className="h-4 w-4 text-tonki-accent" />
                  {photoPreview ? "Cambiar logo" : "Subir logo"}
                </label>
                {photoFile ? (
                  <span className="text-xs font-semibold text-tonki-cta">
                    Logo nuevo sin guardar
                  </span>
                ) : null}
              </div>
              <input
                ref={fileInputRef}
                id="business-photo"
                name="photo"
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                onChange={handlePhotoChange}
                className="sr-only"
              />
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Nombre" htmlFor="business-name">
              <input
                id="business-name"
                name="name"
                type="text"
                required
                maxLength={150}
                value={form.name}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, name: e.target.value }))
                }
                className={FIELD_CLASS}
              />
            </Field>
            <Field
              label="Categoría"
              htmlFor="business-category"
              optional={!onboarding}
            >
              <input
                id="business-category"
                name="category"
                type="text"
                required={onboarding}
                maxLength={100}
                value={form.category}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, category: e.target.value }))
                }
                className={FIELD_CLASS}
                placeholder="Cafetería, restaurante, tienda…"
              />
            </Field>
            <Field
              label="Descripción"
              htmlFor="business-description"
              optional={!onboarding}
              className="sm:col-span-2"
              hint={
                <span className="flex justify-end tabular-nums">
                  {form.description.length}/{DESCRIPTION_MAX}
                </span>
              }
            >
              <textarea
                id="business-description"
                name="description"
                rows={4}
                required={onboarding}
                maxLength={DESCRIPTION_MAX}
                value={form.description}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, description: e.target.value }))
                }
                className={TEXTAREA_CLASS}
                placeholder="Qué ofreces, ambiente, especialidades…"
              />
            </Field>
          </div>
        </Panel>

        <Panel
          icon={<IconPhone className="h-5 w-5" />}
          title="Contacto"
          description="Cómo te encuentran y te escriben."
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field
              label="Dirección"
              htmlFor="business-address"
              optional={!onboarding}
              className="sm:col-span-2"
            >
              <input
                id="business-address"
                name="address"
                type="text"
                required={onboarding}
                maxLength={255}
                autoComplete="street-address"
                value={form.address}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, address: e.target.value }))
                }
                className={FIELD_CLASS}
              />
            </Field>
            <Field
              label="Teléfono"
              htmlFor="business-phone"
              optional={!onboarding}
            >
              <input
                id="business-phone"
                name="phone"
                type="tel"
                required={onboarding}
                maxLength={30}
                value={form.phone}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, phone: e.target.value }))
                }
                className={FIELD_CLASS}
              />
            </Field>
            <Field label="Sitio web" htmlFor="business-website" optional>
              <input
                id="business-website"
                name="website"
                type="text"
                maxLength={255}
                value={form.website}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, website: e.target.value }))
                }
                className={FIELD_CLASS}
                placeholder="https://"
              />
            </Field>
          </div>
        </Panel>

        <Panel
          icon={<IconClock className="h-5 w-5" />}
          title="Horario"
          description={onboarding ? "Al menos un día abierto." : undefined}
        >
          <BusinessHoursField
            value={form.hours}
            onChange={(hours) => setForm((prev) => ({ ...prev, hours }))}
          />
        </Panel>

        <div className="@container">
          <div className="grid gap-6 @3xl:grid-cols-2">
            <Panel
              icon={<IconMapPin className="h-5 w-5" />}
              title="Ubicación"
              description="X es longitud, Y latitud y Z altura en metros."
              action={
                mapHref ? (
                  <a
                    href={mapHref}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-semibold text-tonki-cta hover:underline"
                  >
                    Probar en mapa
                    <IconExternal className="h-3.5 w-3.5" />
                  </a>
                ) : null
              }
            >
              <div className="grid grid-cols-3 gap-3">
                {(
                  [
                    ["location_x", "X", "Longitud", "business-x"],
                    ["location_y", "Y", "Latitud", "business-y"],
                    ["location_z", "Z", "Altura", "business-z"],
                  ] as const
                ).map(([key, axis, label, id]) => (
                  <div key={key}>
                    <label
                      htmlFor={id}
                      className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-tonki-text"
                    >
                      <span className="flex h-5 w-5 items-center justify-center rounded-md bg-tonki-chrome text-[10px] font-bold text-tonki-accent">
                        {axis}
                      </span>
                      {label}
                    </label>
                    <input
                      id={id}
                      name={key}
                      type="text"
                      inputMode="decimal"
                      value={form[key]}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, [key]: e.target.value }))
                      }
                      className={`${FIELD_CLASS} px-3 tabular-nums`}
                    />
                  </div>
                ))}
              </div>
            </Panel>

            <Panel
              icon={<IconHex className="h-5 w-5" />}
              title="Tonkis"
              description="Lo que regresa a tus clientes por cada compra."
            >
              <div className="flex items-stretch gap-3">
                <div className="relative w-28 shrink-0">
                  <input
                    id="business-cashback"
                    name="cashback_percent"
                    type="number"
                    required
                    min={1}
                    max={100}
                    step={1}
                    inputMode="numeric"
                    aria-label="Porcentaje de Tonkis"
                    value={form.cashback_percent}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        cashback_percent: e.target.value,
                      }))
                    }
                    className={`${FIELD_CLASS} h-14 pr-9 text-2xl font-bold tabular-nums`}
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-lg font-bold text-tonki-text-muted">
                    %
                  </span>
                </div>
                <div className="flex flex-wrap content-center gap-2">
                  {CASHBACK_PRESETS.map((preset) => {
                    const active = cashback === preset;
                    return (
                      <button
                        key={preset}
                        type="button"
                        onClick={() =>
                          setForm((prev) => ({
                            ...prev,
                            cashback_percent: String(preset),
                          }))
                        }
                        aria-pressed={active}
                        className={`h-9 rounded-full px-3.5 text-sm font-bold tabular-nums transition ${
                          active
                            ? "bg-tonki-accent text-tonki-accent-fg shadow-sm"
                            : "border border-tonki-border-strong bg-white/60 text-tonki-text-secondary hover:border-tonki-accent"
                        }`}
                      >
                        {preset}%
                      </button>
                    );
                  })}
                </div>
              </div>
              <p className="mt-3 text-xs text-tonki-text-faint">
                Entero del 1 al 100. El valor por defecto es 5.
              </p>
            </Panel>
          </div>
        </div>

        <div
          className={`sticky z-20 ${
            onboarding
              ? "bottom-4"
              : "bottom-[calc(84px+env(safe-area-inset-bottom))]"
          }`}
        >
          <div className="flex flex-col gap-3 rounded-2xl border border-tonki-chrome-border bg-tonki-chrome/95 p-3 pl-4 text-tonki-chrome-text shadow-[0_18px_40px_-16px_rgba(0,0,0,0.6)] backdrop-blur-md sm:flex-row sm:items-center sm:justify-between">
            <p
              role={error ? "alert" : success ? "status" : undefined}
              className={`text-sm ${
                error
                  ? "font-semibold text-red-300"
                  : success
                    ? "font-semibold text-tonki-accent"
                    : "text-tonki-chrome-text-muted"
              }`}
            >
              {error ??
                success ??
                (onboarding
                  ? "Revisa tus datos antes de continuar."
                  : "Los cambios se publican al guardar.")}
            </p>
            <button
              type="submit"
              disabled={saving}
              className={`${PRIMARY_BUTTON_CLASS} w-full shrink-0 sm:w-auto`}
            >
              {saving
                ? "Guardando…"
                : onboarding
                  ? "Completar perfil y entrar"
                  : exists
                    ? "Guardar negocio"
                    : "Crear negocio"}
            </button>
          </div>
        </div>
      </form>

      {!onboarding && exists ? (
        <EstablishmentGalleryEditor
          images={establishment.images}
          onChange={(next) => {
            setEstablishment(next);
            setPhotoPreview(next.avatar_url);
          }}
        />
      ) : null}
    </div>
  );
}
