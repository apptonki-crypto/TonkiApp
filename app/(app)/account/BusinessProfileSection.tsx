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

import { readJsonSafely } from "src/lib/api/readJsonSafely";
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

const FIELD =
  "w-full rounded-xl border border-tonki-border bg-tonki-surface px-4 py-3 text-tonki-text outline-none transition-colors focus:border-tonki-accent";

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

export function BusinessProfileSection() {
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

        const res = await fetch("/api/establishment", {
          method: "PUT",
          credentials: "include",
          body,
        });
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
      } catch {
        setError("No se pudo guardar el negocio");
      } finally {
        setSaving(false);
      }
    },
    [form, photoFile]
  );

  const exists = establishment !== null;

  return (
    <section className="mt-8 space-y-5 rounded-2xl border border-tonki-border bg-tonki-surface p-6 shadow-sm sm:p-8">
      <div>
        <h2 className="text-xl font-bold tracking-tight text-tonki-text">
          Tu negocio
        </h2>
        <p className="mt-2 text-sm text-tonki-text-muted">
          {exists
            ? "Actualiza el establecimiento que acredita Tonkis."
            : "Registra tu establecimiento para acreditar Tonkis a tus clientes."}
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-tonki-text-muted">Cargando negocio…</p>
      ) : !loaded ? (
        error ? (
          <p
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-tonki-danger"
          >
            {error}
          </p>
        ) : null
      ) : (
        <>
          {error ? (
            <p
              role="alert"
              className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-tonki-danger"
            >
              {error}
            </p>
          ) : null}
          {success ? (
            <p
              role="status"
              className="rounded-xl border border-tonki-accent/40 bg-tonki-accent/10 px-4 py-3 text-sm font-medium text-tonki-text"
            >
              {success}
            </p>
          ) : null}

          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-5">
            <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
              <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-tonki-border bg-tonki-canvas text-sm font-semibold text-tonki-text-muted">
                {photoPreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={photoPreview}
                    alt="Logo del negocio"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  "Sin foto"
                )}
              </div>
              <div>
                <label
                  htmlFor="business-photo"
                  className="mb-1.5 block text-sm font-medium text-tonki-text"
                >
                  Logo
                </label>
                <input
                  ref={fileInputRef}
                  id="business-photo"
                  name="photo"
                  type="file"
                  accept="image/jpeg,image/png,image/gif,image/webp"
                  onChange={handlePhotoChange}
                  className="block w-full text-sm text-tonki-text-secondary file:mr-3 file:rounded-xl file:border-0 file:bg-tonki-accent file:px-3 file:py-2 file:text-sm file:font-semibold file:text-tonki-accent-fg"
                />
                <p className="mt-1 text-xs text-tonki-text-faint">
                  JPG, PNG, GIF o WebP · máx. 2 MB
                </p>
              </div>
            </div>

            <div>
              <label
                htmlFor="business-name"
                className="mb-1.5 block text-sm font-medium text-tonki-text"
              >
                Nombre
              </label>
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
                className={FIELD}
              />
            </div>

            <div>
              <label
                htmlFor="business-address"
                className="mb-1.5 block text-sm font-medium text-tonki-text"
              >
                Dirección
              </label>
              <input
                id="business-address"
                name="address"
                type="text"
                maxLength={255}
                autoComplete="street-address"
                value={form.address}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, address: e.target.value }))
                }
                className={FIELD}
              />
            </div>

            <div>
              <label
                htmlFor="business-category"
                className="mb-1.5 block text-sm font-medium text-tonki-text"
              >
                Categoría
              </label>
              <input
                id="business-category"
                name="category"
                type="text"
                maxLength={100}
                value={form.category}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, category: e.target.value }))
                }
                className={FIELD}
              />
            </div>

            <div>
              <label
                htmlFor="business-description"
                className="mb-1.5 block text-sm font-medium text-tonki-text"
              >
                Descripción
              </label>
              <textarea
                id="business-description"
                name="description"
                rows={4}
                maxLength={4000}
                value={form.description}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, description: e.target.value }))
                }
                className={FIELD}
                placeholder="Qué ofreces, ambiente, especialidades…"
              />
            </div>

            <div>
              <label
                htmlFor="business-phone"
                className="mb-1.5 block text-sm font-medium text-tonki-text"
              >
                Teléfono
              </label>
              <input
                id="business-phone"
                name="phone"
                type="tel"
                maxLength={30}
                value={form.phone}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, phone: e.target.value }))
                }
                className={FIELD}
              />
            </div>

            <BusinessHoursField
              value={form.hours}
              onChange={(hours) => setForm((prev) => ({ ...prev, hours }))}
            />

            <div>
              <label
                htmlFor="business-website"
                className="mb-1.5 block text-sm font-medium text-tonki-text"
              >
                Sitio web
              </label>
              <input
                id="business-website"
                name="website"
                type="text"
                maxLength={255}
                value={form.website}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, website: e.target.value }))
                }
                className={FIELD}
                placeholder="https://"
              />
            </div>

            <fieldset className="space-y-3 rounded-xl border border-tonki-border p-4">
              <legend className="px-1 text-sm font-medium text-tonki-text">
                Ubicación
              </legend>
              <p className="text-xs text-tonki-text-faint">
                X es longitud, Y latitud y Z altura en metros. Visible en el
                perfil público.
              </p>
              <div className="grid gap-3 sm:grid-cols-3">
                {(
                  [
                    ["location_x", "X · longitud", "business-x"],
                    ["location_y", "Y · latitud", "business-y"],
                    ["location_z", "Z · altura", "business-z"],
                  ] as const
                ).map(([key, label, id]) => (
                  <div key={key}>
                    <label
                      htmlFor={id}
                      className="mb-1.5 block text-xs font-medium text-tonki-text"
                    >
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
                      className={FIELD}
                    />
                  </div>
                ))}
              </div>
            </fieldset>

            <div>
              <label
                htmlFor="business-cashback"
                className="mb-1.5 block text-sm font-medium text-tonki-text"
              >
                Porcentaje de Tonkis
              </label>
              <input
                id="business-cashback"
                name="cashback_percent"
                type="number"
                required
                min={1}
                max={100}
                step={1}
                inputMode="numeric"
                value={form.cashback_percent}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    cashback_percent: e.target.value,
                  }))
                }
                className={FIELD}
              />
              <p className="mt-1 text-xs text-tonki-text-faint">
                Entero del 1 al 100. El valor por defecto es 5.
              </p>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-xl bg-tonki-accent px-4 py-3 text-base font-bold text-tonki-accent-fg transition-colors hover:bg-tonki-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving
                ? "Guardando…"
                : exists
                  ? "Guardar negocio"
                  : "Crear negocio"}
            </button>
          </form>

          {exists ? (
            <>
              <EstablishmentGalleryEditor
                images={establishment.images}
                onChange={(next) => {
                  setEstablishment(next);
                  setPhotoPreview(next.avatar_url);
                }}
              />
              <Link
                href={`/negocios?lugar=${establishment.establishment_id}`}
                className="block w-full rounded-xl border border-tonki-border px-4 py-3 text-center text-base font-semibold text-tonki-accent transition-colors hover:bg-tonki-elevated"
              >
                Ver perfil público
              </Link>
            </>
          ) : null}

          <Link
            href="/admin/crm"
            className="block w-full rounded-xl border border-tonki-border px-4 py-3 text-center text-base font-semibold text-tonki-accent transition-colors hover:bg-tonki-elevated"
          >
            CRM · ventas y productos
          </Link>
          <Link
            href="/admin/cobrar"
            className="block w-full rounded-xl border border-tonki-border px-4 py-3 text-center text-base font-semibold text-tonki-accent transition-colors hover:bg-tonki-elevated"
          >
            Generar QR de consumo
          </Link>
        </>
      )}
    </section>
  );
}
