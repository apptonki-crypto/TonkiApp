"use client";

import { useState } from "react";

import { readJsonSafely } from "src/lib/api/readJsonSafely";
import type {
  EstablishmentRewardCatalogItem,
  PrizeRedemptionItem,
} from "src/lib/rewards/types";

function formatPoints(value: number): string {
  return value.toLocaleString("es-MX");
}

function statusLabel(status: PrizeRedemptionItem["status"]): string {
  if (status === "delivered") return "Entregado";
  if (status === "cancelled") return "Cancelado";
  return "Pendiente de entrega";
}

export function CustomerRedemptions({
  items,
  onChanged,
}: {
  items: PrizeRedemptionItem[];
  onChanged: () => Promise<void> | void;
}) {
  if (items.length === 0) return null;
  return (
    <section className="mt-8">
      <SectionHeading title="Tus canjes" count={items.length} />
      <ul className="mt-4 space-y-3">
        {items.map((item) => (
          <RedemptionCard
            key={item.id}
            item={item}
            audience="customer"
            onChanged={onChanged}
          />
        ))}
      </ul>
    </section>
  );
}

export function AdminRedemptions({
  items,
  onChanged,
}: {
  items: PrizeRedemptionItem[];
  onChanged: () => Promise<void> | void;
}) {
  const pending = items.filter((item) => item.status === "pending").length;
  return (
    <section className="mt-8">
      <SectionHeading
        title="Canjes por entregar"
        count={pending > 0 ? pending : undefined}
      />
      {items.length === 0 ? (
        <p className="mt-4 rounded-3xl border border-dashed border-tonki-border-strong bg-tonki-surface-hover/30 px-4 py-8 text-center text-sm text-tonki-text-muted">
          Cuando un cliente canjee un premio, aparece aquí con su código para
          que lo marques como entregado.
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {items.map((item) => (
            <RedemptionCard
              key={item.id}
              item={item}
              audience="admin"
              onChanged={onChanged}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function RedemptionCard({
  item,
  audience,
  onChanged,
}: {
  item: PrizeRedemptionItem;
  audience: "customer" | "admin";
  onChanged: () => Promise<void> | void;
}) {
  const [busy, setBusy] = useState<"deliver" | "cancel" | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = item.status === "pending";

  const run = async (action: "deliver" | "cancel") => {
    setError(null);
    setBusy(action);
    try {
      const path =
        action === "deliver"
          ? `/api/rewards/redemptions/${item.id}/deliver`
          : `/api/rewards/redemptions/${item.id}/cancel`;
      const res = await fetch(path, { method: "POST", credentials: "include" });
      const data = await readJsonSafely<{ success?: boolean; error?: string }>(res);
      if (!res.ok || !data?.success) {
        setError(data?.error || "No se pudo actualizar el canje");
        return;
      }
      await onChanged();
    } catch {
      setError("No se pudo actualizar el canje");
    } finally {
      setBusy(null);
    }
  };

  return (
    <li className="rounded-3xl border border-tonki-border bg-white p-4 shadow-[0_10px_30px_-22px_rgba(45,33,13,0.45)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[11px] font-semibold uppercase tracking-wider text-tonki-cta">
            {audience === "admin" ? item.customer_name : item.establishment_name}
          </p>
          <h3 className="mt-1 text-base font-bold text-tonki-text">{item.title}</h3>
          <p className="mt-1 text-xs font-semibold text-tonki-text-muted">
            {statusLabel(item.status)} · {formatPoints(item.points)} Tonkis
          </p>
        </div>
        <p className="shrink-0 font-mono text-lg font-bold tracking-[0.18em] text-tonki-text">
          {item.code}
        </p>
      </div>

      {error ? (
        <p role="alert" className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-tonki-danger">
          {error}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(item.code).then(
              () => setCopied(true),
              () => setCopied(false)
            );
          }}
          className="rounded-full border border-tonki-border px-3 py-1.5 text-xs font-bold text-tonki-text"
        >
          {copied ? "Código copiado" : "Copiar código"}
        </button>
        {pending && audience === "admin" ? (
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void run("deliver")}
            className="rounded-full bg-tonki-chrome px-3 py-1.5 text-xs font-bold text-tonki-accent disabled:opacity-60"
          >
            {busy === "deliver" ? "Guardando…" : "Marcar entregado"}
          </button>
        ) : null}
        {pending ? (
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void run("cancel")}
            className="rounded-full border border-red-200 px-3 py-1.5 text-xs font-bold text-tonki-danger disabled:opacity-60"
          >
            {busy === "cancel" ? "Cancelando…" : "Cancelar canje"}
          </button>
        ) : null}
      </div>
    </li>
  );
}

export function RedeemConfirm({
  reward,
  onClose,
  onDone,
}: {
  reward: EstablishmentRewardCatalogItem;
  onClose: () => void;
  onDone: () => Promise<void> | void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/rewards/redeem", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ establishment_reward_id: reward.id }),
      });
      const data = await readJsonSafely<{ success?: boolean; error?: string }>(res);
      if (!res.ok || !data?.success) {
        setError(data?.error || "No se pudo canjear el premio");
        return;
      }
      await onDone();
      onClose();
    } catch {
      setError("No se pudo canjear el premio");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-tonki-overlay px-4 py-6 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="redeem-reward-title"
    >
      <div className="tonki-feed-in w-full max-w-md rounded-3xl border border-tonki-border bg-white p-5 shadow-2xl sm:p-6">
        <h2 id="redeem-reward-title" className="text-lg font-bold text-tonki-text">
          Canjear {reward.title}
        </h2>
        <p className="mt-2 text-sm text-tonki-text-secondary">
          Vas a apartar{" "}
          <span className="font-semibold text-tonki-text">
            {formatPoints(reward.value_tonkis)} Tonkis
          </span>{" "}
          en {reward.establishment_name}. Muéstrale el código al negocio para que
          te entregue el premio. Si cancelas antes de eso, los Tonkis regresan.
        </p>
        {error ? (
          <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-tonki-danger">
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
            Volver
          </button>
          <button
            type="button"
            onClick={() => void confirm()}
            disabled={busy}
            className="flex-1 rounded-xl bg-tonki-accent px-4 py-2.5 text-sm font-bold text-tonki-accent-fg disabled:opacity-60"
          >
            {busy ? "Canjeando…" : "Canjear"}
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
