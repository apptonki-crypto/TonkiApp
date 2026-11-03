import { Prisma } from "src/generated/prisma/client";
import type {
  EstablishmentImageItem,
  EstablishmentProfile,
} from "src/lib/establishment/types";

type ImageRow = {
  image_id: string;
  url: string;
  sort_order: number;
};

type EstablishmentRow = {
  establishment_id: string;
  name: string;
  address: string | null;
  category: string | null;
  avatar_url: string | null;
  description: string | null;
  phone: string | null;
  website: string | null;
  hours: string | null;
  location_x: Prisma.Decimal | null;
  location_y: Prisma.Decimal | null;
  location_z: Prisma.Decimal | null;
  cashback_percent: number;
  images?: ImageRow[];
};

function coord(value: Prisma.Decimal | null, digits: number): string | null {
  if (value === null) return null;
  return value.toFixed(digits);
}

export function mapEstablishmentProfile(row: EstablishmentRow): EstablishmentProfile {
  const images: EstablishmentImageItem[] = (row.images ?? []).map((image) => ({
    image_id: image.image_id,
    url: image.url,
    sort_order: image.sort_order,
  }));

  return {
    establishment_id: row.establishment_id,
    name: row.name,
    address: row.address,
    category: row.category,
    avatar_url: row.avatar_url,
    description: row.description,
    phone: row.phone,
    website: row.website,
    hours: row.hours,
    location_x: coord(row.location_x, 7),
    location_y: coord(row.location_y, 7),
    location_z: coord(row.location_z, 2),
    cashback_percent: row.cashback_percent,
    images,
  };
}

export function decimalOrNull(
  value: number | null | undefined
): Prisma.Decimal | null {
  if (value === null || value === undefined) return null;
  return new Prisma.Decimal(value.toFixed(7));
}

export function altitudeOrNull(
  value: number | null | undefined
): Prisma.Decimal | null {
  if (value === null || value === undefined) return null;
  return new Prisma.Decimal(value.toFixed(2));
}
