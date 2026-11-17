"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";

import { readJsonSafely } from "src/lib/api/readJsonSafely";
import type {
  EstablishmentRewardCatalogItem,
  RewardsPagePayload,
  RewardsPodiumEntry,
} from "src/lib/rewards/types";

type RewardsApiEnvelope =
  | (RewardsPagePayload & { success: true })
  | { success: false; error?: string };

const FIELD =
  "w-full rounded-xl border border-tonki-border bg-tonki-surface px-3 py-2.5 text-sm text-tonki-text outline-none transition-colors focus:border-tonki-accent";

function formatPoints(value: number): string {
  return value.toLocaleString("es-MX");
}

function formatMoney(value: number): string {
  return value.toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  });
}

export function RewardsExperience() {
  const [loading, setLoading] = useState(true);
  const [payload, setPayload] = useState<RewardsPagePayload | null>(null);
  const [editing, setEditing] = useState<EstablishmentRewardCatalogItem | null>(
    null
  );
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] =
    useState<EstablishmentRewardCatalogItem | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/rewards", { credentials: "include" });
    const data = await readJsonSafely<RewardsApiEnvelope>(res);
    if (!res.ok || !data?.success) {
      setPayload(null);
      return;
    }
    setPayload({
      role: data.role,
      greeting_name: data.greeting_name,
      total_points: data.total_points,
      leaderboard: data.leaderboard ?? [],
      consumptions: data.consumptions ?? [],
      catalog: data.catalog ?? [],
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await load();
      } catch {
        if (!cancelled) setPayload(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  const handleSaved = useCallback(
    (reward: EstablishmentRewardCatalogItem, isNew: boolean) => {
      setPayload((prev) => {
        if (!prev) return prev;
        if (isNew) {
          return {
            ...prev,
            catalog: [reward, ...prev.catalog],
          };
        }
        return {
          ...prev,
          catalog: prev.catalog.map((item) =>
            item.id === reward.id ? reward : item
          ),
        };
      });
      setEditing(null);
      setCreating(false);
    },
    []
  );

  const handleDeleted = useCallback((rewardId: string) => {
    setPayload((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        catalog: prev.catalog.filter((item) => item.id !== rewardId),
      };
    });
    setDeleting(null);
    setEditing((current) => (current?.id === rewardId ? null : current));
  }, []);

  if (loading) {
    return (
      <main
        className="mx-auto w-full max-w-2xl px-4 pb-8 pt-6 sm:px-6"
        aria-busy="true"
        aria-label="Cargando recompensas"
      >
        <div className="animate-pulse space-y-6">
          <div className="h-24 rounded-3xl border border-tonki-border bg-tonki-surface-hover/50" />
          <div className="h-52 rounded-3xl bg-tonki-surface-hover" />
          <div className="h-56 rounded-3xl border border-tonki-border bg-tonki-surface-hover/50" />
          <div className="grid grid-cols-2 gap-4">
            <div className="h-64 rounded-3xl border border-tonki-border bg-tonki-surface-hover/50" />
            <div className="h-64 rounded-3xl border border-tonki-border bg-tonki-surface-hover/50" />
          </div>
        </div>
      </main>
    );
  }

  const greetingName = payload?.greeting_name?.trim() || "Usuario";
  const isAdmin = payload?.role === "admin";
  const totalPoints = payload?.total_points ?? 0;

  return (
    <main className="mx-auto w-full max-w-2xl px-4 pb-8 pt-6 sm:px-6">
      <Greeting name={greetingName} isAdmin={isAdmin} />

      {!isAdmin ? (
        <BalanceCard totalPoints={totalPoints} catalog={payload?.catalog ?? []} />
      ) : null}

      {isAdmin ? (
        <PodiumSection
          title="Tabla de líderes"
          emptyMessage="Aún no hay usuarios con consumos en tu establecimiento."
          entries={payload?.leaderboard ?? []}
        />
      ) : (
        <PodiumSection
          title="Tabla de consumos"
          emptyMessage="Aún no tienes consumos registrados en establecimientos."
          entries={payload?.consumptions ?? []}
          linkPlaces
        />
      )}

      <ExploreRewards
        catalog={payload?.catalog ?? []}
        isAdmin={isAdmin}
        totalPoints={totalPoints}
        onAdd={() => {
          setEditing(null);
          setCreating(true);
        }}
        onEdit={(reward) => {
          setCreating(false);
          setEditing(reward);
        }}
        onDelete={(reward) => setDeleting(reward)}
      />

      {(creating || editing) && isAdmin ? (
        <RewardFormModal
          reward={editing}
          onClose={() => {
            setEditing(null);
            setCreating(false);
          }}
          onSaved={handleSaved}
        />
      ) : null}

      {deleting && isAdmin ? (
        <DeleteRewardConfirm
          reward={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={handleDeleted}
        />
      ) : null}
    </main>
  );
}

function Greeting({ name, isAdmin }: { name: string; isAdmin: boolean }) {
  return (
    <header className="relative overflow-hidden rounded-3xl border border-tonki-border bg-gradient-to-br from-tonki-surface-hover/70 via-tonki-canvas to-tonki-canvas px-5 py-5 sm:px-6">
      <div
        aria-hidden
        className="tonki-hex-light tonki-mask-fade pointer-events-none absolute inset-y-0 right-0 w-2/3"
      />
      <div className="relative flex items-center gap-3">
        <span
          aria-hidden
          className="tonki-hex-cell h-9 w-8 shrink-0 bg-tonki-accent shadow-sm"
        />
        <div className="min-w-0">
          <p className="text-sm font-medium text-tonki-text-muted">
            Bienvenido de vuelta
          </p>
          <h1 className="truncate text-2xl font-bold tracking-tight text-tonki-text">
            ¡Hola, {name}!
          </h1>
        </div>
      </div>
      <p className="relative mt-3 text-sm text-tonki-text-secondary">
        {isAdmin
          ? "Gestiona las recompensas de tu negocio y conoce a tus clientes más fieles."
          : "Junta Tonkis en tus negocios favoritos y canjéalos por recompensas."}
      </p>
    </header>
  );
}

function TonkiCoin({ className = "h-16 w-14" }: { className?: string }) {
  return (
    <span
      className={`tonki-hex-cell flex shrink-0 items-center justify-center bg-gradient-to-br from-tonki-accent to-tonki-cta p-[3px] ${className}`}
    >
      <span className="tonki-hex-cell flex h-full w-full items-center justify-center bg-tonki-accent">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/Logos-Tonki-SVG/Isotipo caf-amarillo.svg"
          alt=""
          className="h-3/5 w-3/5 object-contain"
        />
      </span>
    </span>
  );
}

function BalanceCard({
  totalPoints,
  catalog,
}: {
  totalPoints: number;
  catalog: EstablishmentRewardCatalogItem[];
}) {
  const nextReward = catalog
    .filter((r) => r.value_tonkis > totalPoints)
    .sort((a, b) => a.value_tonkis - b.value_tonkis)[0];
  const affordableCount = catalog.filter(
    (r) => r.value_tonkis <= totalPoints
  ).length;
  const progress = nextReward
    ? Math.min(100, (totalPoints / nextReward.value_tonkis) * 100)
    : 100;

  return (
    <section className="tonki-feed-in relative mt-6 overflow-hidden rounded-3xl bg-tonki-chrome p-6 text-tonki-chrome-text shadow-[0_24px_48px_-28px_rgba(32,32,32,0.8)]">
      <div
        aria-hidden
        className="tonki-hex-dark tonki-mask-fade pointer-events-none absolute inset-y-0 right-0 w-3/4"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-12 -top-12 h-44 w-44 rounded-full bg-tonki-accent/20 blur-3xl"
      />
      <div className="relative flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-tonki-chrome-text-muted">
            Tus Tonkis
          </p>
          <p className="mt-2 text-5xl font-bold tabular-nums tracking-tight text-tonki-accent">
            {formatPoints(totalPoints)}
          </p>
          <p className="mt-1 text-sm text-tonki-chrome-text-secondary">
            Puntos acumulados por tus consumos
          </p>
        </div>
        <div className="relative">
          <span
            aria-hidden
            className="tonki-pulse-ring tonki-hex-cell absolute -inset-2 bg-tonki-accent/30"
          />
          <TonkiCoin className="relative h-16 w-14" />
        </div>
      </div>

      <div className="relative mt-6 rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
        {nextReward ? (
          <>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <p className="min-w-0 truncate text-tonki-chrome-text-secondary">
                Próxima:{" "}
                <span className="font-semibold text-tonki-chrome-text">
                  {nextReward.title}
                </span>
              </p>
              <p className="shrink-0 tabular-nums text-tonki-chrome-text-muted">
                faltan{" "}
                <span className="font-bold text-tonki-accent">
                  {formatPoints(nextReward.value_tonkis - totalPoints)}
                </span>
              </p>
            </div>
            <div
              className="mt-3 h-2 overflow-hidden rounded-full bg-white/10"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(progress)}
              aria-label={`Progreso hacia ${nextReward.title}`}
            >
              <div
                className="h-full rounded-full bg-gradient-to-r from-tonki-accent to-tonki-accent-hover transition-[width] duration-700"
                style={{ width: `${progress}%` }}
              />
            </div>
            {affordableCount > 0 ? (
              <p className="mt-2 text-xs text-tonki-chrome-text-muted">
                Ya puedes canjear {affordableCount}{" "}
                {affordableCount === 1 ? "recompensa" : "recompensas"}.
              </p>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-tonki-chrome-text-secondary">
            {catalog.length > 0
              ? "¡Te alcanza para todas las recompensas disponibles!"
              : "Pronto habrá recompensas para canjear tus Tonkis."}
          </p>
        )}
      </div>
    </section>
  );
}

function PodiumSection({
  title,
  emptyMessage,
  entries,
  linkPlaces = false,
}: {
  title: string;
  emptyMessage: string;
  entries: RewardsPodiumEntry[];
  linkPlaces?: boolean;
}) {
  const byRank = new Map(entries.map((e) => [e.rank, e]));
  const ordered = [byRank.get(2), byRank.get(1), byRank.get(3)].filter(
    (e): e is RewardsPodiumEntry => Boolean(e)
  );

  return (
    <section className="mt-8">
      <SectionHeading title={title} />
      {ordered.length === 0 ? (
        <EmptyState message={emptyMessage} />
      ) : (
        <div className="relative mt-4 overflow-hidden rounded-3xl border border-tonki-border bg-white px-4 pt-8 shadow-[0_10px_30px_-22px_rgba(45,33,13,0.45)] sm:px-6">
          <div
            aria-hidden
            className="tonki-hex-light tonki-hive-fade pointer-events-none absolute inset-0"
          />
          <ol className="relative flex items-end justify-center gap-2 sm:gap-3">
            {ordered.map((entry, index) => (
              <PodiumItem
                key={entry.id}
                entry={entry}
                linkPlaces={linkPlaces}
                delayMs={index * 90}
              />
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}

const PODIUM_STYLE: Record<
  1 | 2 | 3,
  { frame: string; avatar: string; step: string; stepText: string }
> = {
  1: {
    frame: "from-tonki-accent to-tonki-cta",
    avatar: "h-20 w-[70px]",
    step: "h-28 bg-gradient-to-b from-tonki-accent to-tonki-accent-hover",
    stepText: "text-tonki-accent-fg",
  },
  2: {
    frame: "from-tonki-border-strong to-tonki-text-muted",
    avatar: "h-16 w-14",
    step: "h-20 bg-gradient-to-b from-tonki-surface-hover to-tonki-border",
    stepText: "text-tonki-text-muted",
  },
  3: {
    frame: "from-tonki-border-strong to-tonki-cta/70",
    avatar: "h-16 w-14",
    step: "h-14 bg-gradient-to-b from-tonki-surface-hover/70 to-tonki-border/80",
    stepText: "text-tonki-text-muted",
  },
};

function PodiumItem({
  entry,
  linkPlaces,
  delayMs,
}: {
  entry: RewardsPodiumEntry;
  linkPlaces: boolean;
  delayMs: number;
}) {
  const style = PODIUM_STYLE[entry.rank];
  const initial = entry.name.trim().charAt(0).toUpperCase() || "?";

  return (
    <li
      className="tonki-feed-in flex w-1/3 max-w-40 flex-col items-center"
      style={{ animationDelay: `${delayMs}ms` }}
    >
      {entry.rank === 1 ? (
        <svg
          viewBox="0 0 24 24"
          className="mb-1 h-6 w-6 text-tonki-accent drop-shadow-sm"
          fill="currentColor"
          aria-hidden
        >
          <path d="M3 7.5 7.5 11 12 4l4.5 7L21 7.5 19 18H5L3 7.5Zm2 12h14v1.5H5V19.5Z" />
        </svg>
      ) : null}
      <span
        className={`tonki-hex-cell flex ${style.avatar} items-center justify-center bg-gradient-to-br ${style.frame} p-[3px]`}
      >
        <span className="tonki-hex-cell flex h-full w-full items-center justify-center overflow-hidden bg-tonki-canvas text-xl font-bold text-tonki-text">
          {entry.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={entry.avatar_url}
              alt={entry.name}
              className="h-full w-full object-cover"
            />
          ) : (
            initial
          )}
        </span>
      </span>
      {linkPlaces ? (
        <Link
          href={`/negocios?lugar=${entry.id}`}
          className="mt-2 max-w-full truncate text-sm font-bold text-tonki-text decoration-tonki-accent decoration-2 underline-offset-4 hover:underline"
        >
          {entry.name}
        </Link>
      ) : (
        <p className="mt-2 max-w-full truncate text-sm font-bold text-tonki-text">
          {entry.name}
        </p>
      )}
      <p className="mt-0.5 text-xs font-semibold tabular-nums text-tonki-cta">
        {formatPoints(entry.points)} pts
      </p>
      <div
        className={`mt-3 flex w-full items-start justify-center rounded-t-2xl pt-2 ${style.step}`}
      >
        <span className={`text-2xl font-bold ${style.stepText}`}>
          {entry.rank}
        </span>
      </div>
    </li>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="mt-4 flex flex-col items-center gap-3 rounded-3xl border border-dashed border-tonki-border-strong bg-tonki-surface-hover/30 px-4 py-10 text-center">
      <span aria-hidden className="tonki-hex-cell h-10 w-9 bg-tonki-border" />
      <p className="max-w-xs text-sm text-tonki-text-muted">{message}</p>
    </div>
  );
}

function ExploreRewards({
  catalog,
  isAdmin,
  totalPoints,
  onAdd,
  onEdit,
  onDelete,
}: {
  catalog: EstablishmentRewardCatalogItem[];
  isAdmin: boolean;
  totalPoints: number;
  onAdd: () => void;
  onEdit: (reward: EstablishmentRewardCatalogItem) => void;
  onDelete: (reward: EstablishmentRewardCatalogItem) => void;
}) {
  return (
    <section className="mt-8">
      <div className="flex items-center justify-between gap-3">
        <SectionHeading
          title="Explora recompensas"
          count={catalog.length > 0 ? catalog.length : undefined}
        />
        {isAdmin ? (
          <button
            type="button"
            onClick={onAdd}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-tonki-chrome px-4 py-2 text-sm font-bold text-tonki-accent shadow-sm transition-colors hover:bg-tonki-chrome-hover"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.5}
              className="h-4 w-4"
              aria-hidden
            >
              <path strokeLinecap="round" d="M12 5v14M5 12h14" />
            </svg>
            Agregar
          </button>
        ) : null}
      </div>
      {catalog.length === 0 ? (
        <EmptyState message="Aún no hay recompensas publicadas." />
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:gap-4">
          {catalog.map((reward, index) => (
            <RewardCard
              key={reward.id}
              reward={reward}
              isAdmin={isAdmin}
              totalPoints={totalPoints}
              delayMs={Math.min(index, 7) * 60}
              onEdit={() => onEdit(reward)}
              onDelete={() => onDelete(reward)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function RewardCard({
  reward,
  isAdmin,
  totalPoints,
  delayMs,
  onEdit,
  onDelete,
}: {
  reward: EstablishmentRewardCatalogItem;
  isAdmin: boolean;
  totalPoints: number;
  delayMs: number;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const imageSrc =
    reward.image_url?.trim() || "/Logos-Tonki-SVG/Isotipo caf-crema.svg";
  const isFallback = !reward.image_url?.trim();
  const missing = Math.max(0, reward.value_tonkis - totalPoints);
  const canClaim = missing === 0;

  return (
    <article
      className="tonki-feed-in group flex flex-col overflow-hidden rounded-3xl border border-tonki-border bg-white shadow-[0_10px_30px_-22px_rgba(45,33,13,0.45)] transition duration-200 hover:-translate-y-0.5 hover:border-tonki-border-strong hover:shadow-[0_18px_40px_-24px_rgba(45,33,13,0.55)]"
      style={{ animationDelay: `${delayMs}ms` }}
    >
      <div
        className={`relative flex aspect-[4/3] items-center justify-center overflow-hidden ${
          isFallback ? "tonki-hex-light bg-tonki-surface-hover/60" : "bg-tonki-media-bg"
        }`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageSrc}
          alt={reward.title}
          className={
            isFallback
              ? "h-14 w-14 object-contain opacity-40"
              : "h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          }
        />
        <span className="absolute bottom-2 left-2 inline-flex items-center gap-1.5 rounded-full bg-tonki-chrome/90 py-1 pl-1 pr-2.5 text-sm font-bold tabular-nums text-tonki-accent shadow-md backdrop-blur-sm">
          <TonkiCoin className="h-5 w-[18px]" />
          {formatPoints(reward.value_tonkis)}
        </span>
      </div>
      <div className="flex flex-1 flex-col p-3 sm:p-4">
        <Link
          href={`/negocios?lugar=${reward.establishment_id}`}
          className="truncate text-[11px] font-semibold uppercase tracking-wider text-tonki-cta hover:underline"
        >
          {reward.establishment_name}
        </Link>
        <h3 className="mt-1 text-[15px] font-bold leading-snug tracking-tight text-tonki-text">
          {reward.title}
        </h3>
        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-tonki-text-secondary">
          {reward.short_description}
        </p>
        <p className="mt-2 text-xs font-medium text-tonki-text-muted">
          Valor aprox. {formatMoney(reward.value_usd)}
        </p>
        <div className="mt-auto pt-3">
          {isAdmin ? (
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={onEdit}
                className="rounded-full border border-tonki-border bg-tonki-canvas py-2 text-sm font-bold text-tonki-text transition-colors hover:border-tonki-accent hover:bg-tonki-accent/15"
              >
                Editar
              </button>
              <button
                type="button"
                onClick={onDelete}
                className="rounded-full border border-red-200 bg-transparent py-2 text-sm font-bold text-tonki-danger transition-colors hover:bg-red-50"
              >
                Eliminar
              </button>
            </div>
          ) : (
            <div>
              <div className="h-1.5 overflow-hidden rounded-full bg-tonki-surface-hover">
                <div
                  className="h-full rounded-full bg-tonki-accent"
                  style={{
                    width: `${Math.min(100, reward.value_tonkis > 0 ? (totalPoints / reward.value_tonkis) * 100 : 0)}%`,
                  }}
                />
              </div>
              <p className="mt-2 text-center text-xs font-semibold tabular-nums text-tonki-text-muted">
                {canClaim
                  ? "Ya tienes los Tonkis"
                  : `Te faltan ${formatPoints(missing)} Tonkis`}
              </p>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

function RewardFormModal({
  reward,
  onClose,
  onSaved,
}: {
  reward: EstablishmentRewardCatalogItem | null;
  onClose: () => void;
  onSaved: (reward: EstablishmentRewardCatalogItem, isNew: boolean) => void;
}) {
  const isNew = reward === null;
  const [title, setTitle] = useState(reward?.title ?? "");
  const [shortDescription, setShortDescription] = useState(
    reward?.short_description ?? ""
  );
  const [longDescription, setLongDescription] = useState(
    reward?.long_description ?? ""
  );
  const [valueTonkis, setValueTonkis] = useState(
    reward ? String(reward.value_tonkis) : ""
  );
  const [valueUsd, setValueUsd] = useState(
    reward ? String(reward.value_usd) : ""
  );
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(
    reward?.image_url?.trim() || null
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (preview?.startsWith("blob:")) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  const handleImageChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    if (!file) return;
    setImageFile(file);
    setPreview((prev) => {
      if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const body = new FormData();
      body.set("title", title);
      body.set("short_description", shortDescription);
      body.set("long_description", longDescription);
      body.set("value_tonkis", valueTonkis);
      body.set("value_usd", valueUsd);
      if (imageFile) body.set("image", imageFile);

      const res = await fetch(
        isNew ? "/api/rewards/catalog" : `/api/rewards/catalog/${reward.id}`,
        {
          method: isNew ? "POST" : "PATCH",
          credentials: "include",
          body,
        }
      );
      const data = await readJsonSafely<{
        success?: boolean;
        error?: string;
        reward?: EstablishmentRewardCatalogItem;
      }>(res);

      if (!res.ok || !data?.success || !data.reward) {
        setError(
          data?.error ||
            (isNew
              ? "No se pudo crear la recompensa"
              : "No se pudo guardar la recompensa")
        );
        return;
      }
      onSaved(data.reward, isNew);
    } catch {
      setError(
        isNew
          ? "No se pudo crear la recompensa"
          : "No se pudo guardar la recompensa"
      );
    } finally {
      setSaving(false);
    }
  };

  const previewSrc = preview || "/Logos-Tonki-SVG/Isotipo caf-crema.svg";
  const previewIsFallback = !preview;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-tonki-overlay px-4 py-6 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="reward-form-title"
    >
      <div className="tonki-feed-in max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-tonki-border bg-white p-5 shadow-2xl sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2
              id="reward-form-title"
              className="text-lg font-bold text-tonki-text"
            >
              {isNew ? "Agregar recompensa" : "Editar recompensa"}
            </h2>
            {reward?.establishment_name ? (
              <p className="mt-1 text-xs text-tonki-text-muted">
                {reward.establishment_name}
              </p>
            ) : (
              <p className="mt-1 text-xs text-tonki-text-muted">
                Se publicará en tu establecimiento
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-2 py-1 text-sm font-medium text-tonki-text-muted hover:bg-tonki-elevated"
          >
            Cerrar
          </button>
        </div>

        {error ? (
          <p
            role="alert"
            className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-tonki-danger"
          >
            {error}
          </p>
        ) : null}

        <form onSubmit={(e) => void handleSubmit(e)} className="mt-4 space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-xl bg-tonki-elevated">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewSrc}
                alt="Vista previa"
                className={
                  previewIsFallback
                    ? "h-12 w-12 object-contain opacity-35"
                    : "h-full w-full object-cover"
                }
              />
            </div>
            <div className="min-w-0 flex-1">
              <label
                htmlFor="reward-image"
                className="mb-1 block text-sm font-medium text-tonki-text"
              >
                Imagen
              </label>
              <input
                id="reward-image"
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                onChange={handleImageChange}
                className="block w-full text-xs text-tonki-text-secondary file:mr-2 file:rounded-lg file:border-0 file:bg-tonki-accent file:px-2 file:py-1.5 file:text-xs file:font-semibold file:text-tonki-accent-fg"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="reward-title"
              className="mb-1 block text-sm font-medium text-tonki-text"
            >
              Título
            </label>
            <input
              id="reward-title"
              required
              maxLength={150}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={FIELD}
            />
          </div>

          <div>
            <label
              htmlFor="reward-short"
              className="mb-1 block text-sm font-medium text-tonki-text"
            >
              Descripción corta
            </label>
            <input
              id="reward-short"
              required
              maxLength={255}
              value={shortDescription}
              onChange={(e) => setShortDescription(e.target.value)}
              className={FIELD}
            />
          </div>

          <div>
            <label
              htmlFor="reward-long"
              className="mb-1 block text-sm font-medium text-tonki-text"
            >
              Descripción larga
            </label>
            <textarea
              id="reward-long"
              rows={4}
              maxLength={5000}
              value={longDescription}
              onChange={(e) => setLongDescription(e.target.value)}
              className={FIELD}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="reward-tonkis"
                className="mb-1 block text-sm font-medium text-tonki-text"
              >
                Valor en tonkis
              </label>
              <input
                id="reward-tonkis"
                type="number"
                min={1}
                step={1}
                required
                value={valueTonkis}
                onChange={(e) => setValueTonkis(e.target.value)}
                className={FIELD}
              />
            </div>
            <div>
              <label
                htmlFor="reward-usd"
                className="mb-1 block text-sm font-medium text-tonki-text"
              >
                Valor en $
              </label>
              <input
                id="reward-usd"
                type="number"
                min={0}
                step="0.01"
                required
                value={valueUsd}
                onChange={(e) => setValueUsd(e.target.value)}
                className={FIELD}
              />
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-tonki-border px-4 py-2.5 text-sm font-semibold text-tonki-text"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 rounded-xl bg-tonki-accent px-4 py-2.5 text-sm font-bold text-tonki-accent-fg disabled:opacity-60"
            >
              {saving
                ? isNew
                  ? "Creando…"
                  : "Guardando…"
                : isNew
                  ? "Crear"
                  : "Guardar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DeleteRewardConfirm({
  reward,
  onClose,
  onDeleted,
}: {
  reward: EstablishmentRewardCatalogItem;
  onClose: () => void;
  onDeleted: (rewardId: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/rewards/catalog/${reward.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await readJsonSafely<{
        success?: boolean;
        error?: string;
      }>(res);
      if (!res.ok || !data?.success) {
        setError(data?.error || "No se pudo eliminar la recompensa");
        return;
      }
      onDeleted(reward.id);
    } catch {
      setError("No se pudo eliminar la recompensa");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-tonki-overlay px-4 py-6 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-reward-title"
    >
      <div className="tonki-feed-in w-full max-w-md rounded-3xl border border-tonki-border bg-white p-5 shadow-2xl sm:p-6">
        <h2
          id="delete-reward-title"
          className="text-lg font-bold text-tonki-text"
        >
          Eliminar recompensa
        </h2>
        <p className="mt-2 text-sm text-tonki-text-secondary">
          ¿Seguro que quieres eliminar{" "}
          <span className="font-semibold text-tonki-text">{reward.title}</span>?
          Esta acción no se puede deshacer.
        </p>

        {error ? (
          <p
            role="alert"
            className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-tonki-danger"
          >
            {error}
          </p>
        ) : null}

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="flex-1 rounded-xl border border-tonki-border px-4 py-2.5 text-sm font-semibold text-tonki-text disabled:opacity-60"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={busy}
            className="flex-1 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-bold text-tonki-danger disabled:opacity-60"
          >
            {busy ? "Eliminando…" : "Eliminar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function SectionHeading({ title, count }: { title: string; count?: number }) {
  return (
    <div className="flex items-center gap-2">
      <span aria-hidden className="tonki-hex-cell h-4 w-3.5 bg-tonki-accent" />
      <h2 className="text-lg font-bold tracking-tight text-tonki-text">{title}</h2>
      {count !== undefined ? (
        <span className="rounded-full bg-tonki-surface-hover px-2 py-0.5 text-xs font-bold tabular-nums text-tonki-text-muted">
          {count}
        </span>
      ) : null}
    </div>
  );
}
