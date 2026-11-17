import prisma from "src/lib/db";
import { mapEstablishmentProfile } from "src/lib/establishment/mapProfile";
import { listVisitEvents, mergeVisitEvents } from "src/lib/establishment/presentation";
import type {
  EstablishmentProfile,
  EstablishmentVisit,
  PublicEstablishmentCard,
} from "src/lib/establishment/types";

/** Lugares visitados: consumos acreditados y escaneos del QR de presentación. */
export async function listVisitedEstablishments(
  userId: string
): Promise<EstablishmentVisit[]> {
  return mergeVisitEvents(await listVisitEvents(userId));
}

const publicSelect = {
  establishment_id: true,
  name: true,
  address: true,
  category: true,
  avatar_url: true,
  description: true,
  phone: true,
  website: true,
  hours: true,
  location_x: true,
  location_y: true,
  location_z: true,
  cashback_percent: true,
  images: {
    orderBy: [{ sort_order: "asc" as const }, { created_at: "asc" as const }],
    select: { image_id: true, url: true, sort_order: true },
  },
};

export async function loadPublicEstablishment(
  establishmentId: string
): Promise<EstablishmentProfile | null> {
  const row = await prisma.establishment.findUnique({
    where: { establishment_id: establishmentId },
    select: publicSelect,
  });
  return row ? mapEstablishmentProfile(row) : null;
}

export async function listPublicEstablishments(): Promise<PublicEstablishmentCard[]> {
  const rows = await prisma.establishment.findMany({
    orderBy: { name: "asc" },
    select: {
      establishment_id: true,
      name: true,
      category: true,
      address: true,
      avatar_url: true,
      cashback_percent: true,
      images: {
        orderBy: [{ sort_order: "asc" }, { created_at: "asc" }],
        take: 1,
        select: { url: true },
      },
    },
  });

  return rows.map((row) => ({
    establishment_id: row.establishment_id,
    name: row.name,
    category: row.category,
    address: row.address,
    avatar_url: row.avatar_url,
    cashback_percent: row.cashback_percent,
    cover_url: row.images[0]?.url ?? row.avatar_url,
  }));
}
