"use client";

import { useState, type ChangeEvent } from "react";

import { IconClose, IconImage, IconPlus } from "src/components/profile/icons";
import { Notice, Panel } from "src/components/profile/ui";
import { readJsonSafely } from "src/lib/api/readJsonSafely";
import type { EstablishmentProfile } from "src/lib/establishment/types";

const MAX_IMAGES = 8;

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

  const full = images.length >= MAX_IMAGES;

  return (
    <Panel
      icon={<IconImage className="h-5 w-5" />}
      title="Fotos del lugar"
      description="Se muestran en tu perfil público. JPG, PNG, GIF o WebP · máx. 2 MB"
      action={
        <span className="rounded-full bg-tonki-surface-hover px-3 py-1 text-xs font-bold tabular-nums text-tonki-text-secondary">
          {images.length}/{MAX_IMAGES}
        </span>
      }
    >
      {error ? (
        <div className="mb-4">
          <Notice tone="error">{error}</Notice>
        </div>
      ) : null}
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {images.map((image) => (
          <li
            key={image.image_id}
            className="group relative aspect-square overflow-hidden rounded-2xl bg-tonki-surface-hover"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={image.url}
              alt=""
              className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => void remove(image.image_id)}
              aria-label="Quitar foto"
              className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-tonki-chrome/75 text-white backdrop-blur transition hover:bg-tonki-danger disabled:opacity-50 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
            >
              <IconClose className="h-4 w-4" />
            </button>
          </li>
        ))}
        {!full ? (
          <li className="aspect-square">
            <label
              className={`flex h-full w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-tonki-border-strong bg-white/40 text-tonki-text-muted transition hover:border-tonki-accent hover:bg-tonki-accent/10 hover:text-tonki-text ${
                busy ? "pointer-events-none opacity-60" : ""
              }`}
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-tonki-accent text-tonki-accent-fg">
                <IconPlus className="h-5 w-5" />
              </span>
              <span className="text-xs font-semibold">
                {busy ? "Subiendo…" : "Agregar foto"}
              </span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                className="sr-only"
                disabled={busy}
                onChange={(event) => void upload(event)}
              />
            </label>
          </li>
        ) : null}
      </ul>
    </Panel>
  );
}
