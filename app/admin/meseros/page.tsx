"use client";

import { useCallback, useEffect, useState } from "react";

import {
  createAdminStaffInvite,
  fetchAdminStaff,
  revokeAdminStaff,
  revokeAdminStaffInvite,
  type CreatedStaffInviteWithQr,
} from "src/lib/staff/fetchStaffClient";
import type { StaffInviteView, StaffMemberView } from "src/lib/staff/types";

const BUTTON =
  "inline-flex items-center justify-center rounded-xl bg-tonki-accent px-4 py-3 text-sm font-bold text-tonki-accent-fg transition-colors hover:bg-tonki-accent-hover disabled:opacity-50";
const LINK_BUTTON =
  "text-sm font-semibold text-tonki-danger transition-opacity hover:opacity-80 disabled:opacity-50";

function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" });
}

export default function MeserosPage() {
  const [members, setMembers] = useState<StaffMemberView[]>([]);
  const [invites, setInvites] = useState<StaffInviteView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedStaffInviteWithQr | null>(null);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const apply = useCallback((result: Awaited<ReturnType<typeof fetchAdminStaff>>) => {
    if (result.ok) {
      setMembers(result.data.members);
      setInvites(result.data.invites);
      setError(null);
    } else {
      setError(result.error);
    }
    setLoading(false);
  }, []);

  const load = useCallback(async () => apply(await fetchAdminStaff()), [apply]);

  useEffect(() => {
    let cancelled = false;
    void fetchAdminStaff().then((result) => {
      if (!cancelled) apply(result);
    });
    return () => {
      cancelled = true;
    };
  }, [apply]);

  async function createInvite() {
    setCreating(true);
    setCopied(false);
    const result = await createAdminStaffInvite();
    setCreating(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setCreated(result.data);
    void load();
  }

  async function copyLink() {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  async function revokeMember(member: StaffMemberView) {
    if (!window.confirm(`¿Dar de baja a ${member.name}? Ya no podrá generar QR.`)) return;
    setBusyId(member.staff_id);
    const result = await revokeAdminStaff(member.staff_id);
    setBusyId(null);
    if (!result.ok) setError(result.error);
    void load();
  }

  async function cancelInvite(invite: StaffInviteView) {
    setBusyId(invite.invite_id);
    const result = await revokeAdminStaffInvite(invite.invite_id);
    setBusyId(null);
    if (!result.ok) setError(result.error);
    if (created?.invite_id === invite.invite_id) setCreated(null);
    void load();
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
      <h1 className="text-2xl font-bold tracking-tight text-tonki-text sm:text-3xl">Meseros</h1>
      <p className="mt-2 max-w-xl text-sm text-tonki-text-muted sm:text-base">
        Tus meseros generan QR de cobro desde su teléfono, sin acceso a este panel. El pago llega a
        la wallet del negocio y en CRM ves quién generó cada venta.
      </p>

      {error ? (
        <p
          role="alert"
          className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-tonki-danger"
        >
          {error}
        </p>
      ) : null}

      <section className="mt-8 space-y-4 rounded-2xl border border-tonki-border bg-tonki-surface p-6 shadow-sm">
        <h2 className="text-lg font-bold text-tonki-text">Invitar mesero</h2>
        <p className="text-sm text-tonki-text-secondary">
          El enlace sirve una sola vez y vence en 48 horas. El mesero lo abre, entra con su cuenta
          y queda vinculado. No uses la cuenta del negocio.
        </p>
        <button type="button" onClick={() => void createInvite()} disabled={creating} className={BUTTON}>
          {creating ? "Creando…" : "Crear invitación"}
        </button>

        {created ? (
          <div className="space-y-3 rounded-xl border border-tonki-border p-4">
            <p className="text-sm font-semibold text-tonki-text">
              Comparte este enlace o pide que escaneen el QR. Solo se muestra ahora.
            </p>
            <div className="flex justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={created.qr_image}
                alt="QR de invitación de mesero"
                width={220}
                height={220}
                className="h-56 w-56 rounded-xl"
              />
            </div>
            <p className="break-all rounded-lg bg-tonki-elevated px-3 py-2 font-mono text-xs text-tonki-text-secondary">
              {created.url}
            </p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => void copyLink()}
                className="text-sm font-semibold text-tonki-accent"
              >
                {copied ? "¡Copiado!" : "Copiar enlace"}
              </button>
              <span className="text-xs text-tonki-text-muted">
                Vence: {formatWhen(created.expires_at)}
              </span>
            </div>
          </div>
        ) : null}
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-bold text-tonki-text">Meseros activos</h2>
        {loading ? (
          <p className="mt-3 text-sm text-tonki-text-muted">Cargando…</p>
        ) : members.length === 0 ? (
          <p className="mt-3 text-sm text-tonki-text-muted">Aún no tienes meseros.</p>
        ) : (
          <ul className="mt-3 divide-y divide-tonki-border rounded-2xl border border-tonki-border bg-tonki-surface">
            {members.map((member) => (
              <li key={member.staff_id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-tonki-text">{member.name}</p>
                  <p className="truncate text-xs text-tonki-text-muted">
                    {member.email ?? "Sin correo"} · desde {formatWhen(member.created_at)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void revokeMember(member)}
                  disabled={busyId === member.staff_id}
                  className={LINK_BUTTON}
                >
                  Dar de baja
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {invites.length > 0 ? (
        <section className="mt-8">
          <h2 className="text-lg font-bold text-tonki-text">Invitaciones pendientes</h2>
          <ul className="mt-3 divide-y divide-tonki-border rounded-2xl border border-tonki-border bg-tonki-surface">
            {invites.map((invite) => (
              <li key={invite.invite_id} className="flex items-center justify-between gap-3 px-4 py-3">
                <p className="text-sm text-tonki-text-secondary">
                  Creada {formatWhen(invite.created_at)} · vence {formatWhen(invite.expires_at)}
                </p>
                <button
                  type="button"
                  onClick={() => void cancelInvite(invite)}
                  disabled={busyId === invite.invite_id}
                  className={LINK_BUTTON}
                >
                  Cancelar
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
