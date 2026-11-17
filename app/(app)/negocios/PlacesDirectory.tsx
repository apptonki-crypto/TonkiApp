"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { IconClose } from "src/components/profile/icons";
import { Notice } from "src/components/profile/ui";
import { readJsonSafely } from "src/lib/api/readJsonSafely";
import type { HiveArrival } from "src/lib/establishment/hiveArrivals";
import type {
  EstablishmentProfile,
  EstablishmentVisit,
  PublicEstablishmentCard,
} from "src/lib/establishment/types";

import { PlacesHive } from "./PlacesHive";
import { PublicEstablishmentView } from "./PublicEstablishmentView";

type DetailResponse =
  | { success: true; establishment: EstablishmentProfile }
  | { success: false; error?: string };

export function PlacesDirectory({
  places,
  visits,
  initialProfile,
  arrival,
  viewerKey,
}: {
  places: PublicEstablishmentCard[];
  visits: EstablishmentVisit[] | null;
  initialProfile: EstablishmentProfile | null;
  /** Llegada explícita desde el QR de presentación o un pago. */
  arrival: HiveArrival | null;
  /** Id del cliente con sesión, para recordar en este navegador qué ya se animó. */
  viewerKey: string | null;
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

  // `?nuevo=` solo sirve una vez: al recargar no se repite la animación.
  useEffect(() => {
    if (arrival && !initialProfile) {
      router.replace("/negocios", { scroll: false });
    }
  }, [arrival, initialProfile, router]);

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
      <PlacesHive
        places={places}
        visits={visits}
        arrival={arrival}
        viewerKey={viewerKey}
        onOpen={open}
      />

      <AnimatePresence>
        {openId ? (
          <motion.div
            key="place-dialog"
            className="fixed inset-0 z-[70]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
          >
            <button
              type="button"
              aria-label="Cerrar lugar"
              className="absolute inset-0 bg-tonki-chrome/70 backdrop-blur-sm"
              onClick={close}
            />
            <div className="pointer-events-none absolute inset-0 flex items-end justify-center sm:items-center sm:p-6">
              <motion.div
                role="dialog"
                aria-modal="true"
                aria-labelledby="place-dialog-title"
                className="pointer-events-auto relative flex max-h-[92svh] w-full max-w-xl flex-col overflow-hidden rounded-t-[28px] bg-tonki-canvas shadow-[0_30px_80px_-20px_rgba(0,0,0,0.6)] sm:max-h-[min(90vh,860px)] sm:rounded-[28px]"
                initial={{ y: 48, opacity: 0, scale: 0.98 }}
                animate={{ y: 0, opacity: 1, scale: 1 }}
                exit={{ y: 32, opacity: 0, scale: 0.98 }}
                transition={{ type: "spring", stiffness: 380, damping: 34 }}
              >
                <span
                  aria-hidden="true"
                  className="absolute left-1/2 top-2 z-10 h-1.5 w-10 -translate-x-1/2 rounded-full bg-white/60 sm:hidden"
                />
                <button
                  type="button"
                  onClick={close}
                  aria-label="Cerrar"
                  className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-tonki-chrome/60 text-white backdrop-blur-md transition hover:bg-tonki-chrome"
                >
                  <IconClose className="h-4 w-4" />
                </button>
                <div className="overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)]">
                  {loading ? (
                    <PlaceSkeleton />
                  ) : error ? (
                    <div className="px-6 pb-10 pt-16">
                      <h2 id="place-dialog-title" className="sr-only">
                        Perfil del lugar
                      </h2>
                      <Notice tone="error">{error}</Notice>
                    </div>
                  ) : profile ? (
                    <PublicEstablishmentView
                      profile={profile}
                      titleId="place-dialog-title"
                      visits={
                        visits?.find(
                          (v) => v.establishment_id === profile.establishment_id
                        )?.visits
                      }
                    />
                  ) : null}
                </div>
              </motion.div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}

function PlaceSkeleton() {
  return (
    <div aria-busy="true" className="animate-pulse">
      <h2 id="place-dialog-title" className="sr-only">
        Cargando lugar
      </h2>
      <div className="h-40 bg-tonki-chrome/85 sm:h-48" />
      <div className="px-5 pb-8 sm:px-7">
        <div className="-mt-12 h-24 w-24 rounded-3xl bg-white ring-4 ring-tonki-canvas" />
        <div className="mt-5 h-7 w-2/3 rounded-lg bg-tonki-surface-hover" />
        <div className="mt-3 h-5 w-1/3 rounded-full bg-tonki-surface-hover/70" />
        <div className="mt-6 space-y-2">
          <div className="h-4 w-full rounded bg-tonki-surface-hover/60" />
          <div className="h-4 w-5/6 rounded bg-tonki-surface-hover/60" />
        </div>
        <div className="mt-6 h-40 rounded-2xl bg-tonki-surface-hover/50" />
      </div>
    </div>
  );
}
