"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState, useTransition } from "react";

import {
  BUSINESS_TYPE_LABELS,
  BUSINESS_TYPE_PRESETS,
} from "src/lib/business/schemas";
import type { BusinessHours, BusinessTypePreset, DayHours } from "src/types/business";

import { submitBusinessRegister } from "./actions";
import "./registro-empresa.css";

const DAY_KEYS = [
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
  "sun",
] as const satisfies readonly (keyof BusinessHours)[];

const DAY_LABELS: Record<(typeof DAY_KEYS)[number], string> = {
  mon: "Lunes",
  tue: "Martes",
  wed: "Miércoles",
  thu: "Jueves",
  fri: "Viernes",
  sat: "Sábado",
  sun: "Domingo",
};

function defaultHours(): BusinessHours {
  return {
    mon: { closed: false, open: "09:00", close: "18:00" },
    tue: { closed: false, open: "09:00", close: "18:00" },
    wed: { closed: false, open: "09:00", close: "18:00" },
    thu: { closed: false, open: "09:00", close: "18:00" },
    fri: { closed: false, open: "09:00", close: "18:00" },
    sat: { closed: false, open: "10:00", close: "14:00" },
    sun: { closed: true },
  };
}

function openHours(day: DayHours): { open: string; close: string } {
  if (day.closed) return { open: "09:00", close: "18:00" };
  return { open: day.open, close: day.close };
}

/** Browsers may emit `HH:MM:SS`; Zod expects `HH:MM`. */
function toHhMm(value: string): string {
  return value.slice(0, 5);
}

function normalizeHours(source: BusinessHours): BusinessHours {
  const next = {} as BusinessHours;
  for (const key of DAY_KEYS) {
    const day = source[key];
    next[key] = day.closed
      ? { closed: true }
      : {
          closed: false,
          open: toHhMm(day.open),
          close: toHhMm(day.close),
        };
  }
  return next;
}

export default function RegistroEmpresaPage() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [businessName, setBusinessName] = useState("");
  const [adminName, setAdminName] = useState("");
  const [businessType, setBusinessType] =
    useState<BusinessTypePreset>("food");
  const [customBusinessType, setCustomBusinessType] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [hours, setHours] = useState<BusinessHours>(defaultHours);
  const [error, setError] = useState("");
  const [doneEmail, setDoneEmail] = useState<string | null>(null);

  const typeOptions = useMemo(
    () =>
      BUSINESS_TYPE_PRESETS.map((preset) => ({
        value: preset,
        label:
          preset === "other"
            ? "Otro (escribir)"
            : BUSINESS_TYPE_LABELS[preset],
      })),
    []
  );

  const setDayClosed = useCallback((key: keyof BusinessHours, closed: boolean) => {
    setHours((prev) => {
      const current = prev[key];
      if (closed) {
        return { ...prev, [key]: { closed: true } };
      }
      const times = openHours(current);
      return {
        ...prev,
        [key]: { closed: false, open: times.open, close: times.close },
      };
    });
  }, []);

  const setDayTime = useCallback(
    (key: keyof BusinessHours, field: "open" | "close", value: string) => {
      setHours((prev) => {
        const current = prev[key];
        const times = openHours(current);
        return {
          ...prev,
          [key]: {
            closed: false,
            open: field === "open" ? value : times.open,
            close: field === "close" ? value : times.close,
          },
        };
      });
    },
    []
  );

  const onSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      setError("");

      const payload = {
        businessName,
        adminName,
        businessType,
        customBusinessType:
          businessType === "other" ? customBusinessType : undefined,
        email,
        phone,
        password,
        hours: normalizeHours(hours),
      };

      startTransition(async () => {
        const result = await submitBusinessRegister(payload);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setDoneEmail(result.data.user.email);
      });
    },
    [
      adminName,
      businessName,
      businessType,
      customBusinessType,
      email,
      hours,
      password,
      phone,
    ]
  );

  if (doneEmail) {
    return (
      <div className="biz-reg-page">
        <div className="biz-reg-card biz-reg-card--narrow">
          <div className="biz-reg-brand">
            <img
              src="/Logos-Tonki-SVG/Logo lateral caf-amarillo.svg"
              alt="Tonki"
              width={180}
              height={62}
              className="biz-reg-logo"
            />
          </div>
          <h1 className="biz-reg-title">Cuenta lista</h1>
          <p className="biz-reg-lead">
            Tu negocio ya está registrado. Inicia sesión con{" "}
            <strong>{doneEmail}</strong> para entrar al panel.
          </p>
          <button
            type="button"
            className="login-btn login-btn-primary"
            onClick={() => router.push("/login")}
          >
            Ir a iniciar sesión
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="biz-reg-page">
      <div className="biz-reg-card">
        <div className="biz-reg-brand">
          <img
            src="/Logos-Tonki-SVG/Logo lateral caf-amarillo.svg"
            alt="Tonki"
            width={180}
            height={62}
            className="biz-reg-logo"
          />
        </div>
        <h1 className="biz-reg-title">Registro de negocio</h1>
        <p className="biz-reg-lead">
          Crea la cuenta de administrador de tu establecimiento. Esta página
          está fuera del flujo de la app para comensales.
        </p>

        <form className="biz-reg-form" onSubmit={onSubmit}>
          <label className="biz-reg-field">
            <span className="login-field-label">Nombre del negocio</span>
            <input
              className="login-input"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              required
              maxLength={150}
              autoComplete="organization"
            />
          </label>

          <label className="biz-reg-field">
            <span className="login-field-label">Nombre del administrador</span>
            <input
              className="login-input"
              value={adminName}
              onChange={(e) => setAdminName(e.target.value)}
              required
              maxLength={100}
              autoComplete="name"
            />
          </label>

          <label className="biz-reg-field">
            <span className="login-field-label">Tipo de negocio</span>
            <select
              className="login-input"
              value={businessType}
              onChange={(e) =>
                setBusinessType(e.target.value as BusinessTypePreset)
              }
            >
              {typeOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>

          {businessType === "other" && (
            <label className="biz-reg-field">
              <span className="login-field-label">Tu tipo de negocio</span>
              <input
                className="login-input"
                value={customBusinessType}
                onChange={(e) => setCustomBusinessType(e.target.value)}
                required
                maxLength={100}
                placeholder="Ej. Librería, estética…"
              />
            </label>
          )}

          <div className="biz-reg-row">
            <label className="biz-reg-field">
              <span className="login-field-label">Correo</span>
              <input
                className="login-input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                maxLength={100}
                autoComplete="email"
              />
            </label>
            <label className="biz-reg-field">
              <span className="login-field-label">Teléfono</span>
              <input
                className="login-input"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                maxLength={30}
                autoComplete="tel"
                placeholder="+52 …"
              />
            </label>
          </div>

          <label className="biz-reg-field">
            <span className="login-field-label">Contraseña</span>
            <input
              className="login-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              maxLength={500}
              autoComplete="new-password"
            />
          </label>

          <fieldset className="biz-reg-hours">
            <legend className="login-field-label">Horarios</legend>
            <div className="biz-reg-hours-list">
              {DAY_KEYS.map((key) => {
                const day = hours[key];
                const closed = day.closed;
                const times = openHours(day);
                return (
                  <div key={key} className="biz-reg-day">
                    <label className="biz-reg-day-closed">
                      <input
                        type="checkbox"
                        checked={closed}
                        onChange={(e) => setDayClosed(key, e.target.checked)}
                      />
                      <span>{DAY_LABELS[key]}</span>
                      <span className="biz-reg-day-closed-tag">
                        {closed ? "Cerrado" : "Abierto"}
                      </span>
                    </label>
                    {!closed && (
                      <div className="biz-reg-day-times">
                        <input
                          className="login-input"
                          type="time"
                          value={times.open}
                          onChange={(e) =>
                            setDayTime(key, "open", e.target.value)
                          }
                          required
                        />
                        <span className="biz-reg-day-sep">a</span>
                        <input
                          className="login-input"
                          type="time"
                          value={times.close}
                          onChange={(e) =>
                            setDayTime(key, "close", e.target.value)
                          }
                          required
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </fieldset>

          {error && <p className="login-error">{error}</p>}

          <button
            type="submit"
            className="login-btn login-btn-primary"
            disabled={pending}
          >
            {pending ? "Creando cuenta…" : "Crear cuenta empresarial"}
          </button>
        </form>

        <p className="biz-reg-footer">
          ¿Ya tienes cuenta?{" "}
          <Link href="/login" className="biz-reg-link">
            Inicia sesión
          </Link>
        </p>
      </div>
    </div>
  );
}
