"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { readJsonSafely } from "src/lib/api/readJsonSafely";
import type {
  EstablishmentProfile,
  PublicEstablishmentCard,
} from "src/lib/establishment/types";

import { PublicEstablishmentView } from "./PublicEstablishmentView";

type DetailResponse =
  | { success: true; establishment: EstablishmentProfile }
  | { success: false; error?: string };

export function PlacesDirectory({
  places,
  initialProfile,
}: {
  places: PublicEstablishmentCard[];
  initialProfile: EstablishmentProfile | null;
}) {
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(
    initialProfile?.establishment_id ?? null
  );
  const [profile, setProfile] = useState<EstablishmentProfile | null>(
    initialProfile
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadedId = useRef(initialProfile?.establishment_id ?? null);

  const close = useCallback(() => {
    setOpenId(null);
    setProfile(null);
    setError(null);
    router.replace("/negocios", { scroll: false });
  }, [router]);

  const open = useCallback(
    (establishmentId: string) => {
      setOpenId(establishmentId);
      setProfile(null);
      setError(null);
      router.replace(`/negocios?lugar=${establishmentId}`, { scroll: false });
    },
    [router]
  );

  useEffect(() => {
    if (!openId || loadedId.current === openId) return;
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const res = await fetch(`/api/establishments/${openId}`);
        const data = await readJsonSafely<DetailResponse>(res);
        if (cancelled) return;
        if (!res.ok || !data?.success) {
          setError(
            data && "error" in data && data.error
              ? data.error
              : "No se pudo abrir el lugar"
          );
          setProfile(null);
          return;
        }
        loadedId.current = openId;
        setProfile(data.establishment);
      } catch {
        if (!cancelled) setError("No se pudo abrir el lugar");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [openId]);

  useEffect(() => {
    if (!openId) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [close, openId]);

  return (
    <>
      {places.length === 0 ? (
        <p className="mt-8 text-sm text-tonki-text-muted">
          Aún no hay negocios publicados.
        </p>
      ) : (
        <ul className="mt-6 grid gap-4 sm:grid-cols-2">
          {places.map((place) => {
            const initial = place.name.trim().charAt(0).toUpperCase() || "?";
            return (
              <li key={place.establishment_id}>
                <button
                  type="button"
                  onClick={() => open(place.establishment_id)}
                  className="flex w-full gap-4 rounded-2xl border border-tonki-border bg-tonki-surface p-4 text-left transition-colors hover:bg-tonki-surface-hover"
                >
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-tonki-canvas p-1.5 text-lg font-bold">
                    {place.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={place.avatar_url}
                        alt=""
                        className="max-h-full max-w-full object-contain"
                      />
                    ) : (
                      initial
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-tonki-text">
                      {place.name}
                    </p>
                    <p className="mt-0.5 truncate text-sm text-tonki-text-muted">
                      {place.category ?? "Negocio local"} ·{" "}
                      {place.cashback_percent}% Tonkis
                    </p>
                    {place.address ? (
                      <p className="mt-1 line-clamp-2 text-xs text-tonki-text-faint">
                        {place.address}
                      </p>
                    ) : null}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {openId ? (
          <div className="fixed inset-0 z-[70]">
            <button
              type="button"
              aria-label="Cerrar lugar"
              className="absolute inset-0 bg-tonki-chrome/65 backdrop-blur-sm"
              onClick={close}
            />
            <div className="pointer-events-none absolute inset-0 flex items-end justify-center p-3 pb-[calc(76px+env(safe-area-inset-bottom))] sm:items-center sm:p-6">
              <article
                role="dialog"
                aria-modal="true"
                aria-labelledby="place-dialog-title"
                className="pointer-events-auto max-h-[min(88vh,820px)] w-full max-w-lg overflow-y-auto rounded-2xl border border-tonki-border bg-tonki-surface p-5 shadow-2xl"
              >
                <div className="mb-4 flex items-center justify-between gap-3">
                  <p
                    id="place-dialog-title"
                    className="text-sm font-semibold text-tonki-text-muted"
                  >
                    Perfil del lugar
                  </p>
                  <button
                    type="button"
                    onClick={close}
                    className="rounded-full px-3 py-1 text-sm font-semibold text-tonki-text-muted hover:bg-tonki-elevated hover:text-tonki-text"
                  >
                    Cerrar
                  </button>
                </div>
                {loading ? (
                  <p className="py-8 text-sm text-tonki-text-muted">
                    Cargando lugar…
                  </p>
                ) : error ? (
                  <p role="alert" className="py-8 text-sm text-tonki-danger">
                    {error}
                  </p>
                ) : profile ? (
                  <PublicEstablishmentView profile={profile} />
                ) : null}
              </article>
            </div>
          </div>
        ) : null}
    </>
  );
}
