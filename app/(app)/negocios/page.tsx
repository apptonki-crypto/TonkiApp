import { getSessionFromCookies } from "src/lib/auth/session";
import {
  listPublicEstablishments,
  listVisitedEstablishments,
  loadPublicEstablishment,
} from "src/lib/establishment/loadPublicProfile";
import type { HiveArrival } from "src/lib/establishment/hiveArrivals";

import { PlacesDirectory } from "./PlacesDirectory";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Lugares — Tonki",
  description: "Perfiles públicos de los negocios en Tonki.",
};

type PageProps = {
  searchParams: Promise<{
    lugar?: string;
    /** Lugar recién visitado (tras escanear el QR de presentación o pagar). */
    nuevo?: string;
    via?: string;
    hoy?: string;
  }>;
};

export default async function NegociosPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const session = await getSessionFromCookies();
  const [places, visits] = await Promise.all([
    listPublicEstablishments(),
    session?.role === "user"
      ? listVisitedEstablishments(session.userId)
      : Promise.resolve(null),
  ]);
  const initialId =
    typeof params.lugar === "string" && params.lugar.length > 0
      ? params.lugar
      : null;
  const arrival: HiveArrival | null =
    visits && typeof params.nuevo === "string" && params.nuevo.length <= 36
      ? {
          establishment_id: params.nuevo,
          kind: "new",
          via: params.via === "qr" ? "qr" : "consumo",
          already_today: params.hoy === "1",
        }
      : null;
  const initialProfile = initialId
    ? await loadPublicEstablishment(initialId)
    : null;

  return (
    <main className="mx-auto w-full max-w-6xl px-3 pb-10 pt-4 sm:px-6 sm:pt-8">
      <PlacesDirectory
        places={places}
        visits={visits}
        initialProfile={initialProfile}
        arrival={arrival}
        viewerKey={visits && session ? session.userId : null}
      />
    </main>
  );
}
