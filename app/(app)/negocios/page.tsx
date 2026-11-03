import {
  listPublicEstablishments,
  loadPublicEstablishment,
} from "src/lib/establishment/loadPublicProfile";

import { PlacesDirectory } from "./PlacesDirectory";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Lugares — Tonki",
  description: "Perfiles públicos de los negocios en Tonki.",
};

type PageProps = {
  searchParams: Promise<{ lugar?: string }>;
};

export default async function NegociosPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const places = await listPublicEstablishments();
  const initialId =
    typeof params.lugar === "string" && params.lugar.length > 0
      ? params.lugar
      : null;
  const initialProfile = initialId
    ? await loadPublicEstablishment(initialId)
    : null;

  return (
    <main className="mx-auto w-full px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-bold tracking-tight text-tonki-text sm:text-3xl">
        Lugares
      </h1>
      <p className="mt-2 max-w-xl text-sm text-tonki-text-muted sm:text-base">
        Elige un negocio para ver su logo, fotos y ubicación sin salir de esta
        página.
      </p>
      <PlacesDirectory places={places} initialProfile={initialProfile} />
    </main>
  );
}
