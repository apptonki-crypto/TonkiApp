import type { EstablishmentVisit } from "src/lib/establishment/types";

/** Cómo llegó la novedad al panal. */
export type HiveArrivalVia = "qr" | "consumo";

export type HiveArrival = {
  establishment_id: string;
  /** `new` = celda que se enciende por primera vez; `more` = una visita más. */
  kind: "new" | "more";
  via: HiveArrivalVia;
  /** Escaneó otra vez el mismo día: no sumó visita, solo se saluda. */
  already_today?: boolean;
};

/** Conteo de visitas por lugar que este navegador ya vio animarse. */
export type SeenVisits = Record<string, number>;

export function seenFromVisits(visits: EstablishmentVisit[]): SeenVisits {
  return Object.fromEntries(visits.map((v) => [v.establishment_id, v.visits]));
}

/**
 * Lugares que cambiaron desde la última vez que el cliente abrió el panal.
 * Sin registro previo (`seen` null) no anima nada: la primera carga no es una novedad.
 */
export function diffHiveArrivals(
  seen: SeenVisits | null,
  visits: EstablishmentVisit[]
): HiveArrival[] {
  if (!seen) return [];
  const arrivals: HiveArrival[] = [];
  for (const visit of visits) {
    const before = seen[visit.establishment_id] ?? 0;
    if (visit.visits > before) {
      arrivals.push({
        establishment_id: visit.establishment_id,
        kind: before === 0 ? "new" : "more",
        via: "consumo",
      });
    }
  }
  return arrivals;
}

/**
 * Junta la llegada explícita (`?nuevo=` tras escanear o pagar) con las que detecta el diff.
 * La explícita va primero y define `via`. Máximo tres para no eternizar la animación.
 */
export function planHiveArrivals(
  explicit: HiveArrival | null,
  seen: SeenVisits | null,
  visits: EstablishmentVisit[]
): HiveArrival[] {
  const visitById = new Map(visits.map((v) => [v.establishment_id, v]));
  const detected = diffHiveArrivals(seen, visits);
  const plan: HiveArrival[] = [];

  if (explicit) {
    const visit = visitById.get(explicit.establishment_id);
    if (visit) {
      const before = seen?.[explicit.establishment_id];
      const kind: HiveArrival["kind"] =
        before === undefined ? (visit.visits <= 1 ? "new" : "more") : before === 0 ? "new" : "more";
      plan.push({ ...explicit, kind });
    }
  }
  for (const arrival of detected) {
    if (plan.some((p) => p.establishment_id === arrival.establishment_id)) continue;
    plan.push(arrival);
  }
  return plan.slice(0, 3);
}
