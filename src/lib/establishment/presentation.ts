import { randomBytes } from "crypto";

import { CHARGE_STATUS_CREDITED } from "src/lib/charges/constants";
import prisma from "src/lib/db";
import {
  PRESENTATION_PATH_PREFIX,
  PRESENTATION_TOKEN_RE,
} from "src/lib/establishment/presentationToken";
import type { EstablishmentVisit } from "src/lib/establishment/types";

const VISIT_TIME_ZONE = "America/Mexico_City";

const dayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: VISIT_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Día calendario (YYYY-MM-DD) en la hora de la Ciudad de México. */
export function visitDayKey(date: Date): string {
  return dayFormatter.format(date);
}

export function createPresentationToken(): string {
  return randomBytes(18).toString("base64url");
}

export function presentationUrl(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, "")}${PRESENTATION_PATH_PREFIX}${token}`;
}

export type VisitEvent = { establishment_id: string; at: Date };

/**
 * Une consumos acreditados y escaneos del QR de presentación.
 * Una visita es un día distinto (hora CDMX) con al menos uno de los dos:
 * escanear y pagar el mismo día cuenta una sola vez.
 */
export function mergeVisitEvents(events: VisitEvent[]): EstablishmentVisit[] {
  const byPlace = new Map<string, { days: Set<string>; last: Date }>();
  for (const event of events) {
    const entry = byPlace.get(event.establishment_id);
    const day = visitDayKey(event.at);
    if (!entry) {
      byPlace.set(event.establishment_id, { days: new Set([day]), last: event.at });
      continue;
    }
    entry.days.add(day);
    if (event.at > entry.last) entry.last = event.at;
  }
  return [...byPlace.entries()].map(([establishment_id, entry]) => ({
    establishment_id,
    visits: entry.days.size,
    last_visit_at: entry.last.toISOString(),
  }));
}

export async function listVisitEvents(userId: string): Promise<VisitEvent[]> {
  const [charges, checkIns] = await Promise.all([
    prisma.charge.findMany({
      where: { claimed_by_user_id: userId, status: CHARGE_STATUS_CREDITED },
      select: { establishment_id: true, updated_at: true },
    }),
    prisma.establishmentCheckIn.findMany({
      where: { user_id: userId },
      select: { establishment_id: true, created_at: true },
    }),
  ]);
  return [
    ...charges.map((c) => ({ establishment_id: c.establishment_id, at: c.updated_at })),
    ...checkIns.map((c) => ({ establishment_id: c.establishment_id, at: c.created_at })),
  ];
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "P2002"
  );
}

export type CheckInResult =
  | {
      ok: true;
      checkIn: {
        establishment_id: string;
        establishment_name: string;
        /** Ya había escaneado hoy: no suma otra visita. */
        already_today: boolean;
        /** Es la primera vez que este cliente visita el lugar (ni escaneo ni consumo antes). */
        first_visit: boolean;
      };
    }
  | { ok: false; status: number; error: string };

/** Registra que un cliente escaneó el QR de presentación. Idempotente por día. */
export async function checkInWithPresentationToken(
  userId: string,
  token: string,
  now: Date = new Date()
): Promise<CheckInResult> {
  if (!PRESENTATION_TOKEN_RE.test(token)) {
    return { ok: false, status: 404, error: "Este QR no es válido." };
  }

  const establishment = await prisma.establishment.findUnique({
    where: { presentation_token: token },
    select: { establishment_id: true, name: true, admin_id: true },
  });
  if (!establishment) {
    return {
      ok: false,
      status: 404,
      error: "Este QR ya no es válido. Pide al negocio el código actual.",
    };
  }
  if (establishment.admin_id === userId) {
    return { ok: false, status: 403, error: "No puedes registrar una visita a tu propio negocio." };
  }

  const establishmentId = establishment.establishment_id;
  const [priorCheckIns, priorCharges] = await Promise.all([
    prisma.establishmentCheckIn.count({
      where: { user_id: userId, establishment_id: establishmentId },
    }),
    prisma.charge.count({
      where: {
        claimed_by_user_id: userId,
        establishment_id: establishmentId,
        status: CHARGE_STATUS_CREDITED,
      },
    }),
  ]);

  let alreadyToday = false;
  try {
    await prisma.establishmentCheckIn.create({
      data: { user_id: userId, establishment_id: establishmentId, day: visitDayKey(now) },
    });
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    alreadyToday = true;
  }

  return {
    ok: true,
    checkIn: {
      establishment_id: establishmentId,
      establishment_name: establishment.name,
      already_today: alreadyToday,
      first_visit: !alreadyToday && priorCheckIns === 0 && priorCharges === 0,
    },
  };
}

export type PresentationResult =
  | { ok: true; establishment_id: string; establishment_name: string; token: string }
  | { ok: false; status: number; error: string };

async function findAdminEstablishment(adminId: string) {
  return prisma.establishment.findFirst({
    where: { admin_id: adminId },
    orderBy: { created_at: "asc" },
    select: { establishment_id: true, name: true, presentation_token: true },
  });
}

/** Devuelve el token del negocio, creándolo la primera vez. */
export async function ensurePresentationToken(
  adminId: string,
  options: { rotate?: boolean } = {}
): Promise<PresentationResult> {
  const establishment = await findAdminEstablishment(adminId);
  if (!establishment) {
    return {
      ok: false,
      status: 404,
      error: "Primero completa el perfil de tu negocio.",
    };
  }

  if (establishment.presentation_token && !options.rotate) {
    return {
      ok: true,
      establishment_id: establishment.establishment_id,
      establishment_name: establishment.name,
      token: establishment.presentation_token,
    };
  }

  const token = createPresentationToken();
  // Sin rotar, solo escribe si sigue vacío: dos pestañas no generan dos QR distintos.
  const updated = await prisma.establishment.updateMany({
    where: options.rotate
      ? { establishment_id: establishment.establishment_id }
      : { establishment_id: establishment.establishment_id, presentation_token: null },
    data: { presentation_token: token },
  });
  if (updated.count === 0) {
    const fresh = await findAdminEstablishment(adminId);
    if (!fresh?.presentation_token) {
      return { ok: false, status: 409, error: "No se pudo generar el QR. Intenta de nuevo." };
    }
    return {
      ok: true,
      establishment_id: fresh.establishment_id,
      establishment_name: fresh.name,
      token: fresh.presentation_token,
    };
  }

  return {
    ok: true,
    establishment_id: establishment.establishment_id,
    establishment_name: establishment.name,
    token,
  };
}
