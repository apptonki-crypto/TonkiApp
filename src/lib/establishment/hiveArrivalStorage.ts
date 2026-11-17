import type { HiveArrival, SeenVisits } from "src/lib/establishment/hiveArrivals";

/** Evento de ventana: el panal tiene una novedad sin ver (punto en la barra inferior). */
export const HIVE_PENDING_EVENT = "tonki:hive-pending";

const PENDING_KEY = "tonki:hive:pending";
const seenKey = (viewer: string) => `tonki:hive:seen:${viewer}`;

// localStorage puede no existir o lanzar (modo privado, datos bloqueados).
function safeGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Sin almacenamiento el panal igual funciona; solo no recuerda lo ya visto.
  }
}

export function readSeenVisits(viewer: string): SeenVisits | null {
  const raw = safeGet(seenKey(viewer));
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const out: SeenVisits = {};
    for (const [id, count] of Object.entries(parsed)) {
      if (typeof count === "number" && Number.isFinite(count)) out[id] = count;
    }
    return out;
  } catch {
    return null;
  }
}

export function writeSeenVisits(viewer: string, seen: SeenVisits) {
  safeSet(seenKey(viewer), JSON.stringify(seen));
}

export function hasHivePending(): boolean {
  return safeGet(PENDING_KEY) !== null;
}

/**
 * Tras escanear o pagar: enciende el punto de Lugares hasta que el cliente abra el panal,
 * y recuerda qué lugar animar aunque entre desde la barra y no desde el enlace.
 */
export function markHivePending(arrival: Omit<HiveArrival, "kind">) {
  safeSet(PENDING_KEY, JSON.stringify(arrival));
  window.dispatchEvent(new Event(HIVE_PENDING_EVENT));
}

export function readHivePending(): HiveArrival | null {
  const raw = safeGet(PENDING_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<HiveArrival> | null;
    if (!parsed || typeof parsed.establishment_id !== "string") return null;
    return {
      establishment_id: parsed.establishment_id,
      kind: "new",
      via: parsed.via === "qr" ? "qr" : "consumo",
      already_today: parsed.already_today === true,
    };
  } catch {
    return null;
  }
}

export function clearHivePending() {
  safeSet(PENDING_KEY, null);
  window.dispatchEvent(new Event(HIVE_PENDING_EVENT));
}
