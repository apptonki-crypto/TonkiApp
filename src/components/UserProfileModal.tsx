"use client";

import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useEffect, useState } from "react";

import { readJsonSafely } from "src/lib/api/readJsonSafely";
import type { PublicUserProfile } from "src/lib/users/publicProfile";

type ProfileResponse =
  | { success: true; profile: PublicUserProfile }
  | { success: false; error?: string };

export type ProfilePreview = {
  userId: string;
  name: string;
  avatarUrl: string | null;
};

function formatSince(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("es", { month: "long", year: "numeric" });
}

export function UserProfileModal({
  preview,
  onClose,
}: {
  preview: ProfilePreview | null;
  onClose: () => void;
}) {
  const [profile, setProfile] = useState<PublicUserProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!preview) return;
    let cancelled = false;
    setProfile(null);
    setError(null);
    void (async () => {
      try {
        const res = await fetch(`/api/users/${preview.userId}`);
        const data = await readJsonSafely<ProfileResponse>(res);
        if (cancelled) return;
        if (!res.ok || !data?.success) {
          setError(
            data && "error" in data && data.error
              ? data.error
              : "No se pudo cargar el perfil"
          );
          return;
        }
        setProfile(data.profile);
      } catch {
        if (!cancelled) setError("No se pudo cargar el perfil");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [preview]);

  useEffect(() => {
    if (!preview) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [onClose, preview]);

  const name = profile?.name ?? preview?.name ?? "Usuario";
  const avatar = profile?.avatar_url ?? preview?.avatarUrl ?? null;
  const initial = name.trim().charAt(0).toUpperCase() || "?";

  return (
    <AnimatePresence>
      {preview ? (
        <motion.div className="fixed inset-0 z-[80]" initial={false} animate={{ opacity: 1 }}>
          <button
            type="button"
            aria-label="Cerrar perfil"
            className="absolute inset-0 bg-tonki-chrome/65 backdrop-blur-sm"
            onClick={onClose}
          />
          <div className="pointer-events-none absolute inset-0 flex items-end justify-center p-3 sm:items-center sm:p-6">
            <motion.article
              role="dialog"
              aria-modal="true"
              aria-labelledby="user-profile-title"
              className="pointer-events-auto w-full max-w-md rounded-2xl border border-tonki-border bg-tonki-surface p-5 shadow-2xl"
              initial={false}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 16, opacity: 0 }}
            >
              <div className="mb-4 flex justify-end">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-full px-3 py-1 text-sm font-semibold text-tonki-text-muted hover:bg-tonki-elevated hover:text-tonki-text"
                >
                  Cerrar
                </button>
              </div>
              <div className="flex flex-col items-center text-center">
                <div className="flex h-28 w-28 items-center justify-center rounded-full bg-tonki-canvas p-2">
                  {avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={avatar}
                      alt=""
                      className="max-h-full max-w-full rounded-full object-contain"
                    />
                  ) : (
                    <span className="text-3xl font-bold text-tonki-text-muted">
                      {initial}
                    </span>
                  )}
                </div>
                <h2
                  id="user-profile-title"
                  className="mt-4 text-xl font-bold text-tonki-text"
                >
                  {name}
                </h2>
                {profile ? (
                  <p className="mt-1 text-sm text-tonki-text-muted">
                    En Tonki desde {formatSince(profile.member_since)}
                  </p>
                ) : error ? (
                  <p className="mt-2 text-sm text-tonki-text-muted">{name}</p>
                ) : (
                  <p className="mt-2 text-sm text-tonki-text-muted">
                    Cargando perfil…
                  </p>
                )}
              </div>
              {profile?.establishment ? (
                <Link
                  href={`/negocios?lugar=${profile.establishment.establishment_id}`}
                  onClick={onClose}
                  className="mt-5 flex items-center gap-3 rounded-xl border border-tonki-border px-3 py-3 text-left transition-colors hover:bg-tonki-elevated"
                >
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-tonki-canvas p-1">
                    {profile.establishment.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={profile.establishment.avatar_url}
                        alt=""
                        className="max-h-full max-w-full object-contain"
                      />
                    ) : (
                      <span className="text-sm font-bold">
                        {profile.establishment.name.charAt(0)}
                      </span>
                    )}
                  </span>
                  <span>
                    <span className="block text-xs text-tonki-text-faint">
                      Su negocio
                    </span>
                    <span className="block font-semibold text-tonki-text">
                      {profile.establishment.name}
                    </span>
                  </span>
                </Link>
              ) : null}
            </motion.article>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
