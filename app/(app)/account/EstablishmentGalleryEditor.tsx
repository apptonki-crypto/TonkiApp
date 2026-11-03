"use client";

import { useState, type ChangeEvent } from "react";

import { readJsonSafely } from "src/lib/api/readJsonSafely";
import type { EstablishmentProfile } from "src/lib/establishment/types";

type ResponseBody =
  | { success: true; establishment: EstablishmentProfile }
  | { success: false; error?: string };

export function EstablishmentGalleryEditor({
  images,
  onChange,
}: {
  images: EstablishmentProfile["images"];
  onChange: (establishment: EstablishmentProfile) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const body = new FormData();
      body.set("image", file);
      const res = await fetch("/api/establishment/images", {
        method: "POST",
        credentials: "include",
        body,
      });
      const data = await readJsonSafely<ResponseBody>(res);
      if (!res.ok || !data?.success) {
        setError(
          data && "error" in data && data.error ? data.error : "No se pudo subir"
        );
        return;
      }
      onChange(data.establishment);
    } catch {
      setError("No se pudo subir");
    } finally {
      setBusy(false);
    }
  }

  async function remove(imageId: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/establishment/images/${imageId}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await readJsonSafely<ResponseBody>(res);
      if (!res.ok || !data?.success) {
        setError(
          data && "error" in data && data.error ? data.error : "No se pudo quitar"
        );
        return;
      }
      onChange(data.establishment);
    } catch {
      setError("No se pudo quitar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-tonki-text">Fotos del lugar</p>
          <p className="text-xs text-tonki-text-faint">
            Hasta 8 imágenes públicas. JPG, PNG, GIF o WebP · máx. 2 MB
          </p>
        </div>
        <label className="shrink-0 cursor-pointer rounded-xl bg-tonki-accent px-3 py-2 text-sm font-bold text-tonki-accent-fg">
          {busy ? "…" : "Agregar"}
          <input
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            className="sr-only"
            disabled={busy || images.length >= 8}
            onChange={(event) => void upload(event)}
          />
        </label>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-tonki-danger">
          {error}
        </p>
      ) : null}
      {images.length === 0 ? (
        <p className="text-sm text-tonki-text-muted">Aún no hay fotos del lugar.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {images.map((image) => (
            <li key={image.image_id} className="space-y-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={image.url}
                alt=""
                className="aspect-[4/3] w-full rounded-xl object-cover"
              />
              <button
                type="button"
                disabled={busy}
                onClick={() => void remove(image.image_id)}
                className="text-xs font-semibold text-tonki-danger"
              >
                Quitar
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
