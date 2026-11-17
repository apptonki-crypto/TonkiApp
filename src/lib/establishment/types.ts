export type EstablishmentImageItem = {
  image_id: string;
  url: string;
  sort_order: number;
};

export type EstablishmentProfile = {
  establishment_id: string;
  name: string;
  address: string | null;
  category: string | null;
  avatar_url: string | null;
  description: string | null;
  phone: string | null;
  website: string | null;
  hours: string | null;
  /** Longitud. */
  location_x: string | null;
  /** Latitud. */
  location_y: string | null;
  /** Altura o piso, en metros. */
  location_z: string | null;
  cashback_percent: number;
  images: EstablishmentImageItem[];
};

/** Lugar donde el usuario acreditó un consumo o escaneó el QR de presentación. `visits` = días distintos. */
export type EstablishmentVisit = {
  establishment_id: string;
  visits: number;
  last_visit_at: string;
};

export type PublicEstablishmentCard = {
  establishment_id: string;
  name: string;
  category: string | null;
  address: string | null;
  avatar_url: string | null;
  cashback_percent: number;
  cover_url: string | null;
};
