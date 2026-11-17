"use client";

import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useEffect, useState } from "react";

import {
  IconCalendar,
  IconChevronRight,
  IconClose,
  IconStore,
} from "src/components/profile/icons";
import { initialOf } from "src/components/profile/ui";
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
  const business = profile?.establishment ?? null;

  return (
    <AnimatePresence>
      {preview ? (
        <motion.div
          key="user-profile"
          className="fixed inset-0 z-[80]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          <button
            type="button"
            aria-label="Cerrar perfil"
            className="absolute inset-0 bg-tonki-chrome/70 backdrop-blur-sm"
            onClick={onClose}
          />
          <div className="pointer-events-none absolute inset-0 flex items-end justify-center sm:items-center sm:p-6">
            <motion.article
              role="dialog"
              aria-modal="true"
              aria-labelledby="user-profile-title"
              className="pointer-events-auto relative w-full max-w-md overflow-hidden rounded-t-[28px] bg-tonki-canvas pb-[env(safe-area-inset-bottom)] shadow-[0_30px_80px_-20px_rgba(0,0,0,0.6)] sm:rounded-[28px]"
              initial={{ y: 40, opacity: 0, scale: 0.98 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 24, opacity: 0, scale: 0.98 }}
              transition={{ type: "spring", stiffness: 380, damping: 34 }}
            >
              <div className="relative h-28 overflow-hidden bg-tonki-chrome">
                <div className="tonki-hex-dark absolute inset-0" />
                <div className="absolute -right-12 -top-16 h-48 w-48 rounded-full bg-tonki-accent/30 blur-3xl" />
                <div className="absolute -bottom-20 -left-8 h-40 w-40 rounded-full bg-tonki-cta/35 blur-3xl" />
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Cerrar"
                className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-md transition hover:bg-white/20"
              >
                <IconClose className="h-4 w-4" />
              </button>

              <div className="flex flex-col items-center px-6 pb-7 text-center">
                <div className="-mt-14 h-28 w-28 overflow-hidden rounded-full bg-tonki-chrome-elevated ring-4 ring-tonki-canvas">
                  {avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={avatar}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-4xl font-bold text-tonki-accent">
                      {initialOf(name)}
                    </span>
                  )}
                </div>
                <h2
                  id="user-profile-title"
                  className="mt-4 text-2xl font-bold tracking-tight text-tonki-text"
                >
                  {name}
                </h2>
                {profile ? (
                  <p className="mt-1.5 inline-flex items-center gap-1.5 text-sm text-tonki-text-muted">
                    <IconCalendar className="h-4 w-4" />
                    En Tonki desde {formatSince(profile.member_since)}
                  </p>
                ) : error ? (
                  <p className="mt-1.5 text-sm text-tonki-text-muted">
                    No pudimos cargar más detalles.
                  </p>
                ) : (
                  <span className="mt-2.5 block h-4 w-40 animate-pulse rounded-full bg-tonki-surface-hover" />
                )}

                {business ? (
                  <Link
                    href={`/negocios?lugar=${business.establishment_id}`}
                    onClick={onClose}
                    className="group mt-6 flex w-full items-center gap-3 rounded-2xl border border-tonki-border bg-white/70 p-3 text-left shadow-sm transition hover:border-tonki-accent hover:bg-white"
                  >
                    <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white ring-1 ring-tonki-border">
                      {business.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={business.avatar_url}
                          alt=""
                          className="h-full w-full object-contain p-1"
                        />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center bg-tonki-chrome text-lg font-bold text-tonki-accent">
                          {initialOf(business.name)}
                        </span>
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-tonki-cta">
                        <IconStore className="h-3.5 w-3.5" />
                        Su negocio
                      </span>
                      <span className="mt-0.5 block truncate text-base font-bold text-tonki-text">
                        {business.name}
                      </span>
                    </span>
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-tonki-accent text-tonki-accent-fg transition group-hover:translate-x-0.5">
                      <IconChevronRight className="h-4 w-4" />
                    </span>
                  </Link>
                ) : null}
              </div>
            </motion.article>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
