"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from "react";

import { usePollarLogout } from "src/components/PollarAppProvider";
import {
  IconCamera,
  IconChart,
  IconCheck,
  IconChevronRight,
  IconCopy,
  IconHome,
  IconLayout,
  IconLogout,
  IconQr,
  IconUser,
  IconWallet,
} from "src/components/profile/icons";
import {
  FIELD_CLASS,
  Field,
  Notice,
  Panel,
  PRIMARY_BUTTON_CLASS,
  initialOf,
} from "src/components/profile/ui";
import { readJsonSafely } from "src/lib/api/readJsonSafely";
import { clearTonkiSession } from "src/lib/auth/clearTonkiSession";
import type { AuthMePayload, PublicUser, UserRole } from "src/types/auth";

import { BusinessProfileSection } from "./BusinessProfileSection";
import { UserTonkisSection } from "./UserTonkisSection";

type ApiEnvelope =
  | (AuthMePayload & { success: true })
  | { success: false; error?: string };

type ProfileFormState = {
  email: string;
  first_name: string;
  paternal_surname: string;
  maternal_surname: string;
  birthDate: string;
};

function formFromUser(user: PublicUser): ProfileFormState {
  return {
    email: user.email ?? "",
    first_name: user.first_name ?? "",
    paternal_surname: user.paternal_surname ?? "",
    maternal_surname: user.maternal_surname ?? "",
    birthDate: user.birth_date ?? "",
  };
}

function truncateWallet(wallet: string): string {
  if (wallet.length <= 16) return wallet;
  return `${wallet.slice(0, 6)}…${wallet.slice(-6)}`;
}

function displayName(user: PublicUser): string {
  const full = [user.first_name, user.paternal_surname]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" ");
  return (
    full ||
    user.name?.trim() ||
    user.email?.trim() ||
    "Tu perfil"
  );
}

export default function AccountPage() {
  const router = useRouter();
  const logoutPollar = usePollarLogout();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<UserRole>("user");
  const [user, setUser] = useState<PublicUser | null>(null);
  const [form, setForm] = useState<ProfileFormState>({
    email: "",
    first_name: "",
    paternal_surname: "",
    maternal_surname: "",
    birthDate: "",
  });
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const res = await fetch("/api/auth/me", { credentials: "include" });
      const data = await readJsonSafely<ApiEnvelope>(res);
      if (cancelled) return;
      if (!res.ok || !data?.success) {
        router.replace(`/login?from=${encodeURIComponent("/account")}`);
        return;
      }
      setUser(data.user);
      setRole(data.role);
      setForm(formFromUser(data.user));
      setAvatarPreview(data.user.avatar_url);
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    return () => {
      if (avatarPreview?.startsWith("blob:")) {
        URL.revokeObjectURL(avatarPreview);
      }
    };
  }, [avatarPreview]);

  const handleAvatarChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0] ?? null;
      if (!file) return;
      setAvatarFile(file);
      setAvatarPreview((prev) => {
        if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
        return URL.createObjectURL(file);
      });
      setError(null);
      setSuccess(null);
    },
    []
  );

  const handleSubmit = useCallback(
    async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      setError(null);
      setSuccess(null);
      setSaving(true);

      try {
        const body = new FormData();
        body.set("email", form.email);
        body.set("first_name", form.first_name);
        body.set("paternal_surname", form.paternal_surname);
        body.set("maternal_surname", form.maternal_surname);
        body.set("birthDate", form.birthDate);
        if (avatarFile) {
          body.set("avatar", avatarFile);
        }

        const res = await fetch("/api/auth/profile", {
          method: "PATCH",
          credentials: "include",
          body,
        });
        const data = await readJsonSafely<
          | (AuthMePayload & { success: true; message?: string })
          | { success: false; error?: string }
        >(res);

        if (!res.ok || !data?.success) {
          setError(
            data && "error" in data && data.error
              ? data.error
              : "No se pudo guardar el perfil"
          );
          return;
        }

        setUser(data.user);
        setRole(data.role);
        setForm(formFromUser(data.user));
        setAvatarFile(null);
        setAvatarPreview(data.user.avatar_url);
        if (fileInputRef.current) fileInputRef.current.value = "";
        setSuccess(data.message ?? "Perfil actualizado");
      } catch {
        setError("No se pudo guardar el perfil");
      } finally {
        setSaving(false);
      }
    },
    [avatarFile, form]
  );

  const handleLogout = useCallback(async () => {
    setLogoutBusy(true);
    try {
      logoutPollar();
      await clearTonkiSession();
      router.replace("/login");
      router.refresh();
    } catch {
      setLogoutBusy(false);
    }
  }, [logoutPollar, router]);

  const wallet = user?.wallet_address?.trim() || null;

  const copyWallet = useCallback(async () => {
    if (!wallet) return;
    try {
      await navigator.clipboard.writeText(wallet);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }, [wallet]);

  if (loading || !user) {
    return <AccountSkeleton />;
  }

  const isAdmin = role === "admin";
  const name = displayName(user);

  const personalForm = (
    <Panel
      icon={<IconUser className="h-5 w-5" />}
      title="Datos personales"
      description="Así te identificamos dentro de Tonki."
    >
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="Nombre"
            htmlFor="first_name"
            className={isAdmin ? "sm:col-span-2" : undefined}
          >
            <input
              id="first_name"
              name="first_name"
              type="text"
              required
              maxLength={50}
              autoComplete="given-name"
              value={form.first_name}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, first_name: e.target.value }))
              }
              className={FIELD_CLASS}
            />
          </Field>
          {!isAdmin ? (
            <>
              <Field label="Apellido paterno" htmlFor="paternal_surname" optional>
                <input
                  id="paternal_surname"
                  name="paternal_surname"
                  type="text"
                  maxLength={50}
                  autoComplete="family-name"
                  value={form.paternal_surname}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      paternal_surname: e.target.value,
                    }))
                  }
                  className={FIELD_CLASS}
                />
              </Field>
              <Field label="Apellido materno" htmlFor="maternal_surname" optional>
                <input
                  id="maternal_surname"
                  name="maternal_surname"
                  type="text"
                  maxLength={50}
                  value={form.maternal_surname}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      maternal_surname: e.target.value,
                    }))
                  }
                  className={FIELD_CLASS}
                />
              </Field>
            </>
          ) : null}
          <Field label="Correo" htmlFor="email">
            <input
              id="email"
              name="email"
              type="email"
              required
              maxLength={100}
              autoComplete="email"
              value={form.email}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, email: e.target.value }))
              }
              className={FIELD_CLASS}
            />
          </Field>
          <Field label="Fecha de nacimiento" htmlFor="birthDate">
            <input
              id="birthDate"
              name="birthDate"
              type="date"
              required
              value={form.birthDate}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, birthDate: e.target.value }))
              }
              className={FIELD_CLASS}
            />
          </Field>
        </div>

        {error ? <Notice tone="error">{error}</Notice> : null}
        {success ? <Notice tone="success">{success}</Notice> : null}

        <div className="flex flex-col-reverse items-stretch gap-3 border-t border-tonki-border pt-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-tonki-text-faint">
            {avatarFile
              ? "Tienes una foto nueva sin guardar."
              : "Foto: JPG, PNG, GIF o WebP · máx. 2 MB"}
          </p>
          <button
            type="submit"
            disabled={saving}
            className={`${PRIMARY_BUTTON_CLASS} w-full sm:w-auto`}
          >
            {saving ? "Guardando…" : "Guardar cambios"}
          </button>
        </div>
      </form>
    </Panel>
  );

  return (
    <main className="mx-auto w-full max-w-6xl px-4 pb-12 pt-5 sm:px-6 sm:pt-8">
      <section className="relative isolate overflow-hidden rounded-[28px] bg-tonki-chrome text-tonki-chrome-text shadow-[0_24px_60px_-30px_rgba(32,32,32,0.8)]">
        <div className="tonki-hex-dark tonki-mask-fade absolute inset-0 -z-10" />
        <div className="absolute -right-24 -top-28 -z-10 h-80 w-80 rounded-full bg-tonki-accent/30 blur-3xl" />
        <div className="absolute -bottom-32 left-10 -z-10 h-64 w-64 rounded-full bg-tonki-cta/30 blur-3xl" />

        <div className="flex flex-col gap-6 p-6 sm:flex-row sm:items-center sm:p-9">
          <div className="relative w-fit shrink-0">
            <div className="h-28 w-28 overflow-hidden rounded-full bg-tonki-chrome-elevated ring-4 ring-tonki-accent ring-offset-4 ring-offset-tonki-chrome sm:h-32 sm:w-32">
              {avatarPreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatarPreview}
                  alt="Tu foto de perfil"
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-4xl font-bold text-tonki-accent">
                  {initialOf(name)}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="absolute -bottom-1 -right-1 flex h-10 w-10 items-center justify-center rounded-full border-4 border-tonki-chrome bg-tonki-accent text-tonki-accent-fg transition hover:scale-105 hover:bg-tonki-accent-hover"
              aria-label="Cambiar foto de perfil"
            >
              <IconCamera className="h-4 w-4" />
            </button>
            <input
              ref={fileInputRef}
              id="avatar"
              name="avatar"
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              onChange={handleAvatarChange}
              className="sr-only"
              tabIndex={-1}
            />
          </div>

          <div className="min-w-0 flex-1">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-tonki-accent/40 bg-tonki-accent/15 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-tonki-accent">
              <span className="h-1.5 w-1.5 rounded-full bg-tonki-accent" />
              {isAdmin ? "Cuenta de empresa" : "Miembro Tonki"}
            </span>
            <h1 className="mt-3 truncate text-3xl font-bold tracking-tight sm:text-4xl">
              {name}
            </h1>
            {user.email ? (
              <p className="mt-1 truncate text-sm text-tonki-chrome-text-muted sm:text-base">
                {user.email}
              </p>
            ) : null}

            <div className="mt-4 flex flex-wrap items-center gap-2">
              {wallet ? (
                <button
                  type="button"
                  onClick={() => void copyWallet()}
                  title={wallet}
                  className="group inline-flex items-center gap-2 rounded-full border border-tonki-chrome-border bg-white/5 py-1.5 pl-3 pr-2 text-sm text-tonki-chrome-text-secondary transition hover:border-tonki-accent/60 hover:bg-white/10"
                >
                  <IconWallet className="h-4 w-4 text-tonki-accent" />
                  <span className="font-mono tabular-nums tracking-tight">
                    {truncateWallet(wallet)}
                  </span>
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/10 text-tonki-chrome-text group-hover:bg-tonki-accent group-hover:text-tonki-accent-fg">
                    {copied ? (
                      <IconCheck className="h-3.5 w-3.5" />
                    ) : (
                      <IconCopy className="h-3.5 w-3.5" />
                    )}
                  </span>
                  <span className="sr-only">
                    {copied ? "Wallet copiada" : "Copiar wallet"}
                  </span>
                </button>
              ) : (
                <span className="inline-flex items-center gap-2 rounded-full border border-dashed border-tonki-chrome-border px-3 py-1.5 text-sm text-tonki-chrome-text-muted">
                  <IconWallet className="h-4 w-4" />
                  Sin wallet conectada
                </span>
              )}
              {avatarFile ? (
                <span className="rounded-full bg-tonki-accent px-3 py-1.5 text-xs font-bold text-tonki-accent-fg">
                  Foto nueva · guarda para aplicarla
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start">
        <div className="min-w-0 space-y-6">
          {isAdmin ? (
            <>
              <BusinessProfileSection />
              {personalForm}
            </>
          ) : (
            <>
              <UserTonkisSection />
              {personalForm}
            </>
          )}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24">
          <nav
            aria-label="Accesos rápidos"
            className="overflow-hidden rounded-3xl border border-tonki-border bg-white/55 shadow-[0_18px_40px_-28px_rgba(45,33,13,0.45)]"
          >
            <p className="px-5 pb-2 pt-5 text-[11px] font-bold uppercase tracking-[0.14em] text-tonki-text-faint">
              Accesos rápidos
            </p>
            <ul className="divide-y divide-tonki-border/70 pb-2">
              {isAdmin ? (
                <>
                  <QuickLink
                    href="/admin/dashboard"
                    icon={<IconLayout className="h-5 w-5" />}
                    title="Panel admin"
                    subtitle="Publicaciones y dinámicas"
                  />
                  <QuickLink
                    href="/admin/crm"
                    icon={<IconChart className="h-5 w-5" />}
                    title="CRM"
                    subtitle="Ventas y productos"
                  />
                  <QuickLink
                    href="/admin/cobrar"
                    icon={<IconQr className="h-5 w-5" />}
                    title="Generar QR de consumo"
                    subtitle="Acredita Tonkis al cobrar"
                  />
                  <QuickLink
                    href="/admin/presentacion"
                    icon={<IconQr className="h-5 w-5" />}
                    title="QR de presentación"
                    subtitle="Para tu mostrador: suma visitas"
                  />
                </>
              ) : null}
              <QuickLink
                href="/dashboard"
                icon={<IconHome className="h-5 w-5" />}
                title="Ver feed"
                subtitle="Novedades de tus lugares"
              />
            </ul>
          </nav>

          <button
            type="button"
            disabled={logoutBusy}
            onClick={() => void handleLogout()}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-red-200 bg-white/40 px-4 py-3.5 text-[15px] font-semibold text-tonki-danger transition hover:border-red-300 hover:bg-red-50 disabled:opacity-60"
          >
            <IconLogout className="h-4 w-4" />
            {logoutBusy ? "Cerrando…" : "Cerrar sesión"}
          </button>
        </aside>
      </div>
    </main>
  );
}

function QuickLink({
  href,
  icon,
  title,
  subtitle,
}: {
  href: string;
  icon: ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <li>
      <Link
        href={href}
        className="group flex items-center gap-3 px-5 py-3 transition-colors hover:bg-tonki-surface-hover/60"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-tonki-chrome text-tonki-accent transition group-hover:bg-tonki-accent group-hover:text-tonki-accent-fg">
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-tonki-text">
            {title}
          </span>
          <span className="block truncate text-xs text-tonki-text-muted">
            {subtitle}
          </span>
        </span>
        <IconChevronRight className="h-4 w-4 shrink-0 text-tonki-text-faint transition group-hover:translate-x-0.5 group-hover:text-tonki-text" />
      </Link>
    </li>
  );
}

function AccountSkeleton() {
  return (
    <main
      aria-busy="true"
      aria-label="Cargando perfil"
      className="mx-auto w-full max-w-6xl animate-pulse px-4 pb-12 pt-5 sm:px-6 sm:pt-8"
    >
      <div className="h-56 rounded-[28px] bg-tonki-chrome/90 sm:h-48" />
      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-6">
          <div className="h-64 rounded-3xl bg-tonki-surface-hover/60" />
          <div className="h-80 rounded-3xl bg-tonki-surface-hover/40" />
        </div>
        <div className="h-56 rounded-3xl bg-tonki-surface-hover/40" />
      </div>
    </main>
  );
}
