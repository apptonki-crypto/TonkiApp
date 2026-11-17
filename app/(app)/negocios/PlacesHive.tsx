"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useMemo, useReducer, useRef, useState } from "react";

import { initialOf } from "src/components/profile/ui";
import {
  clearHivePending,
  readHivePending,
  readSeenVisits,
  writeSeenVisits,
} from "src/lib/establishment/hiveArrivalStorage";
import {
  planHiveArrivals,
  seenFromVisits,
  type HiveArrival,
} from "src/lib/establishment/hiveArrivals";
import type {
  EstablishmentVisit,
  PublicEstablishmentCard,
} from "src/lib/establishment/types";

const SQRT3 = Math.sqrt(3);
const MIN_STEP = 96;
const MAX_STEP = 176;
const GAP_RATIO = 0.1;

/** Direcciones axiales en el orden que recorre cada anillo de la espiral. */
const DIRECTIONS = [
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, 0],
  [-1, 1],
  [0, 1],
] as const;

type Axial = { q: number; r: number };
type Point = Axial & { x: number; y: number };

function cellsThroughRing(ring: number): number {
  return 3 * ring * (ring + 1) + 1;
}

function ringsFor(count: number): number {
  let ring = 0;
  while (cellsThroughRing(ring) < count) ring += 1;
  return ring;
}

function spiral(count: number): Axial[] {
  const cells: Axial[] = [{ q: 0, r: 0 }];
  for (let ring = 1; cells.length < count; ring += 1) {
    let q = -ring;
    let r = ring;
    for (const [dq, dr] of DIRECTIONS) {
      for (let step = 0; step < ring; step += 1) {
        cells.push({ q, r });
        q += dq;
        r += dr;
      }
    }
  }
  return cells.slice(0, count);
}

/** Filas desplazadas (odd-r) convertidas a coordenadas axiales. */
function rows(count: number, columns: number): Axial[] {
  return Array.from({ length: count }, (_, index) => {
    const row = Math.floor(index / columns);
    const col = index % columns;
    return { q: col - (row - (row & 1)) / 2, r: row };
  });
}

function toPixel({ q, r }: Axial, step: number): Point {
  return { q, r, x: step * (q + r / 2), y: ((step * SQRT3) / 2) * r };
}

function adjacent(a: Axial, b: Axial): boolean {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr)) === 1;
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function layoutHive(count: number, available: number) {
  const ring = ringsFor(count);
  const spiralFits = (2 * ring + 1) * MIN_STEP <= available;

  let step: number;
  let core: Axial[];
  let filler: Axial[];

  if (spiralFits) {
    step = Math.min(MAX_STEP, available / (2 * ring + 1));
    const all = spiral(cellsThroughRing(ring + 1));
    core = all.slice(0, cellsThroughRing(ring));
    filler = all.slice(count);
  } else {
    const columns = Math.max(2, Math.floor(available / MIN_STEP - 0.5));
    step = Math.min(MAX_STEP, available / (columns + 0.5));
    const filledRows = Math.ceil(count / columns);
    const all = rows((filledRows + 1) * columns, columns);
    core = all.slice(0, filledRows * columns);
    filler = all.slice(count);
  }

  const gap = Math.max(8, step * GAP_RATIO);
  const width = step - gap;
  const height = (width * 2) / SQRT3;
  const corePoints = core.map((cell) => toPixel(cell, step));
  const xs = corePoints.map((p) => p.x);
  const ys = corePoints.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const pad = step * 0.4;
  const stageHeight = maxY - minY + height + pad * 2;
  const offsetX = (available - (maxX - minX)) / 2 - minX;
  const offsetY = pad + height / 2 - minY;

  const place = (cell: Axial) => {
    const p = toPixel(cell, step);
    return { ...p, x: p.x + offsetX, y: p.y + offsetY };
  };

  return {
    step,
    gap,
    width,
    height,
    stageHeight,
    cells: core.slice(0, count).map(place),
    filler: filler.map(place),
  };
}

/** Tiempos de la llegada de una celda, en milisegundos. */
const FLIGHT_MS = 1150;
const SETTLE_MS = 1500;
const BUMP_MS = 1300;
const TOAST_MS = 4200;

type ArrivalPhase = "flying" | "landed";
type ActiveArrival = { arrival: HiveArrival; phase: ArrivalPhase };

function arrivalMessage(arrival: HiveArrival, name: string): string {
  if (arrival.already_today) return `Tu visita de hoy en ${name} ya estaba en tu colmena`;
  if (arrival.kind === "new") {
    return arrival.via === "qr"
      ? `¡${name} se sumó a tu colmena!`
      : `Tu consumo en ${name} encendió una celda nueva`;
  }
  return arrival.via === "qr"
    ? `+1 visita en ${name}`
    : `Tu consumo en ${name} sumó una visita`;
}

/** Retraso antes de la primera llegada: deja terminar la entrada de las celdas. */
const FIRST_ARRIVAL_DELAY_MS = 750;
const NEXT_ARRIVAL_DELAY_MS = 250;

type Toast = { id: string; text: string; key: number };

type ArrivalShow = {
  queue: HiveArrival[];
  active: ActiveArrival | null;
  /** Celdas nuevas que todavía no aterrizan: se pintan como “por descubrir”. */
  waiting: Set<string>;
  toast: Toast | null;
  started: boolean;
};

type ArrivalAction =
  | { type: "plan"; plan: HiveArrival[] }
  | { type: "next"; names: Map<string, string>; reduceMotion: boolean }
  | { type: "land" }
  | { type: "finish" }
  | { type: "hideToast" };

function flies(arrival: HiveArrival): boolean {
  return arrival.kind === "new" && !arrival.already_today;
}

function without(set: Set<string>, id: string): Set<string> {
  if (!set.has(id)) return set;
  const next = new Set(set);
  next.delete(id);
  return next;
}

function arrivalReducer(state: ArrivalShow, action: ArrivalAction): ArrivalShow {
  switch (action.type) {
    case "plan":
      return {
        ...state,
        queue: action.plan,
        waiting: new Set(action.plan.filter(flies).map((a) => a.establishment_id)),
      };
    case "next": {
      const queue = state.queue.filter((a) => action.names.has(a.establishment_id));
      const [next, ...rest] = queue;
      if (!next) return { ...state, queue: [] };
      const flying = flies(next) && !action.reduceMotion;
      return {
        ...state,
        started: true,
        queue: rest,
        active: { arrival: next, phase: flying ? "flying" : "landed" },
        waiting: flying ? state.waiting : without(state.waiting, next.establishment_id),
        toast: {
          id: next.establishment_id,
          text: arrivalMessage(next, action.names.get(next.establishment_id)!),
          key: Date.now(),
        },
      };
    }
    case "land":
      if (!state.active) return state;
      return {
        ...state,
        active: { ...state.active, phase: "landed" },
        waiting: without(state.waiting, state.active.arrival.establishment_id),
      };
    case "finish":
      return { ...state, active: null };
    case "hideToast":
      return { ...state, toast: null };
  }
}

/** Antes de leer localStorage ya se sabe si la llegada de la URL es una celda nueva. */
function initialArrivalShow(
  arrival: HiveArrival | null,
  visits: EstablishmentVisit[] | null
): ArrivalShow {
  const visit = arrival
    ? visits?.find((v) => v.establishment_id === arrival.establishment_id)
    : undefined;
  const waiting = new Set<string>();
  if (arrival && visit && visit.visits <= 1 && !arrival.already_today) {
    waiting.add(arrival.establishment_id);
  }
  return { queue: [], active: null, waiting, toast: null, started: false };
}

export function PlacesHive({
  places,
  visits,
  arrival = null,
  viewerKey = null,
  onOpen,
}: {
  places: PublicEstablishmentCard[];
  /** `null` cuando no hay un usuario cliente con sesión. */
  visits: EstablishmentVisit[] | null;
  /** Llegada explícita (`?nuevo=`): escaneo del QR de presentación o pago. */
  arrival?: HiveArrival | null;
  /** Id del cliente; con él se recuerda en este navegador qué ya se animó. */
  viewerKey?: string | null;
  onOpen: (establishmentId: string) => void;
}) {
  const reduceMotion = useReducedMotion();
  const sectionRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState(960);
  const [query, setQuery] = useState("");

  const planned = useRef(false);
  const [show, dispatch] = useReducer(arrivalReducer, null, () =>
    initialArrivalShow(viewerKey ? arrival : null, visits)
  );
  const { active, waiting, toast } = show;

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setAvailable(Math.max(240, entry.contentRect.width));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Una sola vez por montaje (el ref sobrevive al doble efecto de StrictMode).
  useEffect(() => {
    if (planned.current || !visits || !viewerKey) return;
    planned.current = true;
    const plan = planHiveArrivals(
      arrival ?? readHivePending(),
      readSeenVisits(viewerKey),
      visits
    );
    writeSeenVisits(viewerKey, seenFromVisits(visits));
    clearHivePending();
    // En el siguiente cuadro: las celdas apenas empiezan su entrada desde opacidad 0.
    const frame = requestAnimationFrame(() => dispatch({ type: "plan", plan }));
    return () => cancelAnimationFrame(frame);
  }, [arrival, viewerKey, visits]);

  const visitById = useMemo(
    () => new Map((visits ?? []).map((v) => [v.establishment_id, v])),
    [visits]
  );

  const ordered = useMemo(() => {
    return [...places].sort((a, b) => {
      const va = visitById.get(a.establishment_id);
      const vb = visitById.get(b.establishment_id);
      if (va && vb) {
        return (
          vb.visits - va.visits ||
          vb.last_visit_at.localeCompare(va.last_visit_at)
        );
      }
      if (va) return -1;
      if (vb) return 1;
      return a.name.localeCompare(b.name, "es");
    });
  }, [places, visitById]);

  const indexById = useMemo(
    () => new Map(ordered.map((p, index) => [p.establishment_id, index])),
    [ordered]
  );

  const visitedCount = ordered.filter((p) =>
    visitById.has(p.establishment_id)
  ).length;
  const shownVisited = visitedCount - waiting.size;

  const hive = useMemo(
    () => layoutHive(ordered.length, available),
    [ordered.length, available]
  );

  const bridges = useMemo(() => {
    const links: Array<{ a: Point; b: Point; key: string; ids: [string, string] }> = [];
    for (let i = 0; i < visitedCount; i += 1) {
      for (let j = i + 1; j < visitedCount; j += 1) {
        const a = hive.cells[i]!;
        const b = hive.cells[j]!;
        const ids: [string, string] = [
          ordered[i]!.establishment_id,
          ordered[j]!.establishment_id,
        ];
        if (waiting.has(ids[0]) || waiting.has(ids[1])) continue;
        if (adjacent(a, b)) links.push({ a, b, key: ids.join(":"), ids });
      }
    }
    return links;
  }, [hive, ordered, visitedCount, waiting]);

  const names = useMemo(
    () => new Map(places.map((p) => [p.establishment_id, p.name])),
    [places]
  );

  // Saca la siguiente llegada de la cola.
  const pending = show.queue.length;
  useEffect(() => {
    if (active || pending === 0) return;
    const timer = setTimeout(
      () => dispatch({ type: "next", names, reduceMotion: Boolean(reduceMotion) }),
      show.started ? NEXT_ARRIVAL_DELAY_MS : FIRST_ARRIVAL_DELAY_MS
    );
    return () => clearTimeout(timer);
  }, [active, pending, names, reduceMotion, show.started]);

  // Avanza las fases: vuelo → aterrizaje → siguiente.
  useEffect(() => {
    if (!active) return;
    const timer = setTimeout(
      () => dispatch({ type: active.phase === "flying" ? "land" : "finish" }),
      active.phase === "flying"
        ? FLIGHT_MS
        : active.arrival.kind === "new" && !active.arrival.already_today
          ? SETTLE_MS
          : BUMP_MS
    );
    return () => clearTimeout(timer);
  }, [active]);

  const activeKey = active ? active.arrival.establishment_id : null;
  useEffect(() => {
    if (!activeKey) return;
    sectionRef.current?.scrollIntoView({
      behavior: reduceMotion ? "auto" : "smooth",
      block: "start",
    });
  }, [activeKey, reduceMotion]);

  useEffect(() => {
    if (!toast || active || pending > 0) return;
    const timer = setTimeout(() => dispatch({ type: "hideToast" }), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast, active, pending]);

  const needle = normalize(query.trim());
  const matches = (place: PublicEstablishmentCard) =>
    !needle ||
    normalize(
      [place.name, place.category ?? "", place.address ?? ""].join(" ")
    ).includes(needle);

  const side = hive.width / SQRT3;
  const showChip = hive.width >= 104;
  const isUser = visits !== null;
  const subtitle = !isUser
    ? "Todos los negocios de Tonki en un solo panal. Toca una celda para ver su perfil."
    : shownVisited > 0
      ? `Tus ${shownVisited === 1 ? "lugar visitado se enciende" : `${shownVisited} lugares visitados se encienden y se entrelazan`} en el centro. Cada visita nueva se suma a tu panal.`
      : "Escanea el QR del negocio en tu próxima visita: tu primera celda se encenderá en el centro del panal.";

  const activeId = active?.arrival.establishment_id ?? null;
  const activeIndex = activeId ? indexById.get(activeId) : undefined;
  const activeCell = activeIndex !== undefined ? hive.cells[activeIndex] : undefined;
  const activePlace = activeIndex !== undefined ? ordered[activeIndex] : undefined;
  const firstLit = ordered.findIndex(
    (p) => visitById.has(p.establishment_id) && !waiting.has(p.establishment_id)
  );

  return (
    <section
      ref={sectionRef}
      className="relative isolate scroll-mt-4 overflow-hidden rounded-[32px] bg-[#17130d] text-tonki-chrome-text shadow-[0_30px_80px_-40px_rgba(0,0,0,0.9)]"
    >
      <div className="tonki-hex-dark absolute inset-0 -z-10 opacity-40" />
      <div className="absolute -left-24 -top-24 -z-10 h-80 w-80 rounded-full bg-tonki-accent/20 blur-3xl" />
      <div className="absolute -bottom-32 -right-16 -z-10 h-96 w-96 rounded-full bg-tonki-cta/25 blur-3xl" />

      <AnimatePresence>
        {toast ? (
          <motion.div
            key={toast.key}
            role="status"
            aria-live="polite"
            className="absolute inset-x-0 top-3 z-40 flex justify-center px-3"
            initial={{ opacity: 0, y: -24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -16, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 420, damping: 30 }}
          >
            <div className="flex max-w-md items-center gap-3 rounded-full border border-tonki-accent/40 bg-[#221a10]/95 py-2 pl-2 pr-2 shadow-[0_12px_40px_-12px_rgba(244,197,66,0.55)] backdrop-blur-md">
              <span className="tonki-hex-cell h-8 w-7 shrink-0 bg-gradient-to-b from-[#ffe08a] to-[#d8961c]" />
              <p className="min-w-0 flex-1 text-sm font-semibold leading-snug">{toast.text}</p>
              <button
                type="button"
                onClick={() => {
                  onOpen(toast.id);
                  dispatch({ type: "hideToast" });
                }}
                className="shrink-0 rounded-full bg-tonki-accent px-3 py-1.5 text-xs font-bold text-tonki-accent-fg transition hover:bg-tonki-accent-hover"
              >
                Ver
              </button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <header className="flex flex-col gap-5 px-5 pt-6 sm:px-8 sm:pt-8 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-xl">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-tonki-accent">
            Lugares
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">
            {isUser ? "Tu colmena" : "La colmena"}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-tonki-chrome-text-muted sm:text-base">
            {subtitle}
          </p>
        </div>

        <div className="flex flex-col gap-3 lg:items-end">
          <dl className="flex flex-wrap gap-2">
            <Stat label="Lugares" value={places.length} />
            {isUser ? <Stat label="Visitados" value={shownVisited} accent /> : null}
            {isUser && bridges.length > 0 ? (
              <Stat label="Conexiones" value={bridges.length} />
            ) : null}
          </dl>
          <label className="relative block w-full lg:w-72">
            <span className="sr-only">Buscar lugar</span>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              aria-hidden="true"
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-tonki-chrome-text-muted"
            >
              <circle cx={11} cy={11} r={7} />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por nombre o categoría"
              className="h-11 w-full rounded-full border border-white/10 bg-white/5 pl-10 pr-4 text-sm text-tonki-chrome-text outline-none transition placeholder:text-tonki-chrome-text-muted/70 focus:border-tonki-accent/70 focus:bg-white/10 focus:ring-4 focus:ring-tonki-accent/20"
            />
          </label>
        </div>
      </header>

      {places.length === 0 ? (
        <p className="px-5 py-16 text-center text-sm text-tonki-chrome-text-muted sm:px-8">
          Aún no hay negocios publicados.
        </p>
      ) : null}

      <div ref={stageRef} className="mx-3 sm:mx-6">
        {places.length > 0 ? (
          <div
            className="relative"
            style={{ height: hive.stageHeight }}
            role="list"
            aria-label="Panal de lugares"
          >
            <div className="tonki-hive-fade pointer-events-none absolute inset-0" aria-hidden="true">
              {hive.filler.map((cell, index) => (
                <span
                  key={`f-${index}`}
                  className="tonki-hex-cell absolute bg-tonki-accent/[0.09]"
                  style={{
                    left: cell.x - hive.width / 2,
                    top: cell.y - hive.height / 2,
                    width: hive.width,
                    height: hive.height,
                  }}
                >
                  <span className="tonki-hex-cell absolute inset-[1.5px] bg-[#17130d]" />
                </span>
              ))}
            </div>

            {firstLit >= 0 ? (
              <div
                aria-hidden="true"
                className="tonki-pulse-ring pointer-events-none absolute rounded-full bg-tonki-accent/25 blur-3xl"
                style={{
                  left: hive.cells[firstLit]!.x - hive.step * 1.2,
                  top: hive.cells[firstLit]!.y - hive.step * 1.2,
                  width: hive.step * 2.4,
                  height: hive.step * 2.4,
                }}
              />
            ) : null}

            <svg
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
            >
              <defs>
                <linearGradient id="hive-honey" x1="0" x2="1">
                  <stop offset="0%" stopColor="#ffe08a" />
                  <stop offset="100%" stopColor="#e3a72a" />
                </linearGradient>
                <filter id="hive-glow" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="3" />
                </filter>
              </defs>
              {bridges.map(({ a, b, key, ids }, index) => {
                const mx = (a.x + b.x) / 2;
                const my = (a.y + b.y) / 2;
                const angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
                const thickness = hive.gap + 8;
                const length = side * 0.82;
                const fresh = activeId !== null && ids.includes(activeId);
                return (
                  <g key={key} transform={`translate(${mx} ${my}) rotate(${angle})`}>
                    <motion.g
                      initial={
                        reduceMotion ? false : fresh ? { opacity: 0, scaleY: 0 } : { opacity: 0 }
                      }
                      animate={{ opacity: 1, scaleY: 1 }}
                      transition={
                        fresh
                          ? { delay: 0.25, type: "spring", stiffness: 180, damping: 14 }
                          : { delay: 0.5 + index * 0.06, duration: 0.4 }
                      }
                    >
                      <rect
                        x={-thickness / 2}
                        y={-length / 2}
                        width={thickness}
                        height={length}
                        rx={4}
                        fill="#f4c542"
                        opacity={fresh ? 1 : 0.7}
                        filter="url(#hive-glow)"
                      />
                      <rect
                        x={-thickness / 2}
                        y={-length / 2}
                        width={thickness}
                        height={length}
                        rx={3}
                        fill="url(#hive-honey)"
                      />
                      <circle r={2.5} fill="#fff7d6" opacity={0.9} />
                    </motion.g>
                  </g>
                );
              })}
            </svg>

            <AnimatePresence>
              {active?.phase === "flying" ? (
                <motion.div
                  key="hive-dim"
                  aria-hidden="true"
                  className="pointer-events-none absolute -inset-x-6 -top-40 bottom-0 z-[5] bg-[#0f0b06]/55"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                />
              ) : null}
            </AnimatePresence>

            {ordered.map((place, index) => {
              const cell = hive.cells[index]!;
              const isWaiting = waiting.has(place.establishment_id);
              const visit = isWaiting
                ? null
                : (visitById.get(place.establishment_id) ?? null);
              const ring = Math.max(
                Math.abs(cell.q),
                Math.abs(cell.r),
                Math.abs(cell.q + cell.r)
              );
              const isActive = activeId === place.establishment_id;
              return (
                <HexTile
                  key={place.establishment_id}
                  place={place}
                  visit={visit}
                  x={cell.x}
                  y={cell.y}
                  width={hive.width}
                  height={hive.height}
                  showChip={showChip}
                  dimmed={!matches(place)}
                  delay={reduceMotion ? 0 : ring * 0.09 + index * 0.015}
                  animate={!reduceMotion}
                  spotlight={isActive ? (active!.phase === "flying" ? "awaiting" : "celebrating") : null}
                  onOpen={onOpen}
                />
              );
            })}

            {active && activeCell && activePlace ? (
              <ArrivalEffects
                key={`${activeId}-${active.phase}`}
                phase={active.phase}
                kind={active.arrival.already_today ? "more" : active.arrival.kind}
                label={
                  active.arrival.already_today
                    ? "Hoy ✓"
                    : active.arrival.kind === "new"
                      ? "¡Nuevo!"
                      : "+1 visita"
                }
                place={activePlace}
                visits={visitById.get(activePlace.establishment_id)?.visits ?? 1}
                target={activeCell}
                startX={available / 2}
                width={hive.width}
                height={hive.height}
                showChip={showChip}
                reduceMotion={Boolean(reduceMotion)}
              />
            ) : null}
          </div>
        ) : null}
      </div>

      {places.length > 0 ? (
        <footer className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 px-5 pb-6 pt-2 text-xs text-tonki-chrome-text-muted">
          {isUser ? (
            <span className="inline-flex items-center gap-2">
              <span className="tonki-hex-cell h-4 w-[14px] bg-tonki-accent" />
              Visitado
            </span>
          ) : null}
          <span className="inline-flex items-center gap-2">
            <span className="tonki-hex-cell h-4 w-[14px] bg-tonki-chrome-border" />
            {isUser ? "Por descubrir" : "Negocio"}
          </span>
          {isUser ? (
            <span className="inline-flex items-center gap-2">
              <span className="h-1.5 w-4 rounded-full bg-tonki-accent shadow-[0_0_8px_rgba(244,197,66,0.8)]" />
              Conexión entre lugares visitados
            </span>
          ) : null}
        </footer>
      ) : null}
    </section>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: boolean;
}) {
  return (
    <div
      className={`flex items-baseline gap-1.5 rounded-full px-3.5 py-1.5 ${
        accent
          ? "bg-tonki-accent text-tonki-accent-fg"
          : "border border-white/10 bg-white/5 text-tonki-chrome-text"
      }`}
    >
      <motion.dd
        key={value}
        className="text-base font-bold tabular-nums"
        initial={{ y: -8, opacity: 0, scale: 1.4 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 500, damping: 18 }}
      >
        {value}
      </motion.dd>
      <dt
        className={`text-xs font-semibold ${
          accent ? "text-tonki-accent-fg/75" : "text-tonki-chrome-text-muted"
        }`}
      >
        {label}
      </dt>
    </div>
  );
}

/** Puntos de un hexágono de punta arriba, centrado en (0,0). */
function hexPoints(width: number, height: number): string {
  const w = width / 2;
  const h = height / 2;
  return [
    [0, -h],
    [w, -h / 2],
    [w, h / 2],
    [0, h],
    [-w, h / 2],
    [-w, -h / 2],
  ]
    .map(([x, y]) => `${x},${y}`)
    .join(" ");
}

const SPARKS = Array.from({ length: 12 }, (_, i) => {
  const angle = (i / 12) * Math.PI * 2 + (i % 2 ? 0.18 : -0.12);
  return {
    dx: Math.cos(angle),
    dy: Math.sin(angle),
    reach: i % 3 === 0 ? 1.15 : i % 3 === 1 ? 0.9 : 0.72,
    size: i % 3 === 0 ? 10 : 7,
    hex: i % 2 === 0,
  };
});

/**
 * Lo que flota sobre el panal durante una llegada: la celda que vuela hasta su
 * hueco y, al aterrizar, el destello, las ondas hexagonales y las chispas de miel.
 */
function ArrivalEffects({
  phase,
  kind,
  label,
  place,
  visits,
  target,
  startX,
  width,
  height,
  showChip,
  reduceMotion,
}: {
  phase: ArrivalPhase;
  kind: HiveArrival["kind"];
  label: string;
  place: PublicEstablishmentCard;
  visits: number;
  target: Point;
  startX: number;
  width: number;
  height: number;
  showChip: boolean;
  reduceMotion: boolean;
}) {
  if (phase === "flying") {
    const startY = -height * 0.9;
    const midX = (startX + target.x) / 2 + (target.x >= startX ? -1 : 1) * width * 0.6;
    const midY = Math.min(startY, target.y) + Math.abs(target.y - startY) * 0.25;
    return (
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute left-0 top-0 z-30 drop-shadow-[0_0_28px_rgba(244,197,66,0.75)]"
        style={{ width, height, marginLeft: -width / 2, marginTop: -height / 2 }}
        initial={{ x: startX, y: startY, scale: 0.2, rotate: -150, opacity: 0 }}
        animate={{
          x: [startX, midX, target.x],
          y: [startY, midY, target.y],
          scale: [0.2, 1.65, 1],
          rotate: [-150, -40, 0],
          opacity: [0, 1, 1],
        }}
        transition={{
          duration: FLIGHT_MS / 1000,
          times: [0, 0.42, 1],
          ease: [0.22, 1, 0.36, 1],
        }}
      >
        <HexFace place={place} visit={{ visits }} width={width} showChip={showChip} />
      </motion.div>
    );
  }

  if (reduceMotion) return null;

  const strong = kind === "new";
  const points = hexPoints(width, height);
  const box = Math.max(width, height) * 3.2;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute z-20"
      style={{ left: target.x - box / 2, top: target.y - box / 2, width: box, height: box }}
    >
      <motion.span
        className="absolute inset-[22%] rounded-full bg-[radial-gradient(circle,rgba(255,236,170,0.95)_0%,rgba(244,197,66,0.55)_35%,transparent_70%)]"
        initial={{ scale: 0.3, opacity: 0.9 }}
        animate={{ scale: strong ? 1.5 : 1.1, opacity: 0 }}
        transition={{ duration: 0.9, ease: "easeOut" }}
      />
      <svg
        className="absolute inset-0 h-full w-full overflow-visible"
        viewBox={`${-box / 2} ${-box / 2} ${box} ${box}`}
      >
        {(strong ? [0, 0.14, 0.3] : [0, 0.16]).map((delay) => (
          <motion.polygon
            key={delay}
            points={points}
            fill="none"
            stroke="#ffd766"
            strokeWidth={3}
            strokeLinejoin="round"
            initial={{ scale: 0.95, opacity: 0.95 }}
            animate={{ scale: strong ? 2.3 : 1.7, opacity: 0, strokeWidth: 0.5 }}
            transition={{ delay, duration: 1.05, ease: [0.16, 1, 0.3, 1] }}
          />
        ))}
      </svg>
      {(strong ? SPARKS : SPARKS.filter((_, i) => i % 2 === 0)).map((spark, i) => (
        <motion.span
          key={i}
          className={`absolute left-1/2 top-1/2 ${
            spark.hex ? "tonki-hex-cell" : "rounded-full"
          } bg-gradient-to-b from-[#fff3c4] to-[#f0b93a]`}
          style={{
            width: spark.size,
            height: spark.hex ? spark.size * 1.15 : spark.size,
            marginLeft: -spark.size / 2,
            marginTop: -spark.size / 2,
          }}
          initial={{ x: 0, y: 0, opacity: 1, scale: 0.4, rotate: 0 }}
          animate={{
            x: spark.dx * width * spark.reach,
            y: [0, spark.dy * width * spark.reach * 0.7, spark.dy * width * spark.reach + width * 0.25],
            opacity: [1, 1, 0],
            scale: [0.4, 1.1, 0.6],
            rotate: spark.hex ? 120 : 0,
          }}
          transition={{ duration: 1.1, ease: "easeOut", delay: 0.03 * (i % 4) }}
        />
      ))}
      <motion.span
        className="absolute left-1/2 top-1/2 whitespace-nowrap rounded-full bg-tonki-accent px-2.5 py-1 text-xs font-extrabold text-tonki-accent-fg shadow-[0_6px_18px_-4px_rgba(244,197,66,0.8)]"
        style={{ x: "-50%" }}
        initial={{ y: -height * 0.35, opacity: 0, scale: 0.6 }}
        animate={{
          y: [-height * 0.35, -height * 0.78, -height * 0.95],
          opacity: [0, 1, 0],
          scale: [0.6, 1.08, 1],
        }}
        transition={{ duration: strong ? SETTLE_MS / 1000 : BUMP_MS / 1000, times: [0, 0.3, 1] }}
      >
        {label}
      </motion.span>
    </div>
  );
}

function HexTile({
  place,
  visit,
  x,
  y,
  width,
  height,
  showChip,
  dimmed,
  delay,
  animate,
  spotlight,
  onOpen,
}: {
  place: PublicEstablishmentCard;
  visit: Pick<EstablishmentVisit, "visits"> | null;
  x: number;
  y: number;
  width: number;
  height: number;
  showChip: boolean;
  dimmed: boolean;
  delay: number;
  animate: boolean;
  /** `awaiting`: hueco que espera a la celda que vuela; `celebrating`: acaba de encenderse. */
  spotlight: "awaiting" | "celebrating" | null;
  onOpen: (establishmentId: string) => void;
}) {
  const label = visit
    ? `${place.name}, visitado ${visit.visits} ${visit.visits === 1 ? "vez" : "veces"}`
    : place.name;

  return (
    <div role="listitem">
      <motion.button
        type="button"
        onClick={() => onOpen(place.establishment_id)}
        aria-label={label}
        className={`group absolute outline-none hover:z-10 focus-visible:z-10 ${
          spotlight ? "z-10" : ""
        } ${visit ? "drop-shadow-[0_0_18px_rgba(244,197,66,0.4)]" : ""}`}
        style={{
          left: x - width / 2,
          top: y - height / 2,
          width,
          height,
        }}
        initial={animate ? { opacity: 0, scale: 0.55 } : false}
        animate={{ opacity: dimmed && !spotlight ? 0.18 : 1, scale: 1 }}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.96 }}
        transition={{ type: "spring", stiffness: 260, damping: 20, delay }}
      >
        {spotlight === "awaiting" ? (
          <motion.span
            aria-hidden="true"
            className="tonki-hex-cell absolute -inset-[6px] bg-tonki-accent/70 blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0.2, 0.9, 0.2] }}
            transition={{ duration: 0.7, repeat: Infinity, ease: "easeInOut" }}
          />
        ) : null}
        <motion.span
          key={spotlight === "celebrating" ? "party" : "calm"}
          className="absolute inset-0 block"
          initial={
            animate && spotlight === "celebrating"
              ? { scale: 1.32, filter: "brightness(1.7)" }
              : false
          }
          animate={{ scale: 1, filter: "brightness(1)" }}
          transition={{ type: "spring", stiffness: 320, damping: 11 }}
        >
          <HexFace place={place} visit={visit} width={width} showChip={showChip} />
        </motion.span>
      </motion.button>
    </div>
  );
}

/** Cara de la celda: borde, fondo, logo, nombre y ficha. */
function HexFace({
  place,
  visit,
  width,
  showChip,
}: {
  place: PublicEstablishmentCard;
  visit: Pick<EstablishmentVisit, "visits"> | null;
  width: number;
  showChip: boolean;
}) {
  const logo = width * 0.36;
  const fontSize = Math.min(14, Math.max(10, width * 0.085));

  return (
    <>
      <span
        className={`tonki-hex-cell absolute inset-0 transition-colors duration-200 ${
          visit
            ? "bg-[#ffe08a]"
            : "bg-tonki-chrome-border group-hover:bg-tonki-accent group-focus-visible:bg-tonki-accent"
        }`}
      />
      <span
        className={`tonki-hex-cell absolute inset-[3px] flex flex-col items-center justify-center gap-1 px-[17%] text-center ${
          visit
            ? "bg-gradient-to-b from-tonki-accent via-[#f0b93a] to-[#d8961c] text-tonki-accent-fg"
            : "bg-gradient-to-b from-[#2f2416] to-[#1e1810] text-tonki-chrome-text"
        }`}
      >
        <span
          className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-white ${
            visit
              ? "ring-2 ring-tonki-chrome/80"
              : "opacity-85 ring-1 ring-white/20 transition group-hover:opacity-100"
          }`}
          style={{ width: logo, height: logo }}
        >
          {place.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={place.avatar_url}
              alt=""
              className="h-full w-full object-contain p-[12%]"
            />
          ) : (
            <span
              className="flex h-full w-full items-center justify-center bg-tonki-chrome font-bold text-tonki-accent"
              style={{ fontSize: logo * 0.45 }}
            >
              {initialOf(place.name)}
            </span>
          )}
        </span>
        <span
          className="line-clamp-2 w-full font-bold leading-tight"
          style={{ fontSize }}
        >
          {place.name}
        </span>
        {showChip ? (
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums ${
              visit
                ? "bg-tonki-chrome text-tonki-accent"
                : "bg-white/10 text-tonki-accent"
            }`}
          >
            {visit
              ? `${visit.visits} ${visit.visits === 1 ? "visita" : "visitas"}`
              : `${place.cashback_percent}% Tonkis`}
          </span>
        ) : null}
      </span>
    </>
  );
}
