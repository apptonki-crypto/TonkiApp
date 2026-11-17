"use client";

import { WalletType, type AuthState } from "@pollar/core";
import { usePollar } from "@pollar/react";
import { useRouter, useSearchParams } from "next/navigation";
import { memo, Suspense, useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { readJsonSafely } from "src/lib/api/readJsonSafely";
import { usePollarLogout, usePollarReady } from "src/components/PollarAppProvider";
import { readPollarPublishableKey } from "src/lib/auth/pollarPublicConfig";
import { sanitizeAuthReturnPath } from "src/lib/auth/sanitizeReturnPath";
import type { AuthResponse } from "src/types/auth";
import "./login.css";

type SessionApiBody = AuthResponse & { error?: string; success?: boolean };

function pollarErrorMessage(state: Extract<AuthState, { step: "error" }>): string {
  switch (state.errorCode) {
    case "EMAIL_CODE_INVALID":
    case "EMAIL_CODE_EXPIRED":
    case "EMAIL_VERIFY_FAILED":
      return "El código no es válido o expiró. Pide uno nuevo.";
    case "EMAIL_SEND_FAILED":
      return "No se pudo enviar el código. Revisa el correo e intenta de nuevo.";
    case "WALLET_CONNECT_FAILED":
    case "WALLET_AUTH_FAILED":
      return "No se pudo conectar Freighter. Aprueba la conexión e intenta de nuevo.";
    case "LOGIN_TIMEOUT":
      return "El inicio de sesión tardó demasiado. Intenta de nuevo.";
    default:
      if (state.message === "An unexpected error occurred") {
        return "No se pudo iniciar sesión con Pollar. Revisa la clave publicable y que este origen esté permitido en el dashboard.";
      }
      return state.message || "No se pudo iniciar sesión.";
  }
}

const GoogleIcon = memo(function GoogleIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-5 w-5"
      focusable="false"
    >
      <path
        fill="#4285F4"
        d="M23.52 12.27c0-.82-.07-1.6-.21-2.36H12v4.46h6.46a5.52 5.52 0 0 1-2.4 3.62v3h3.88c2.27-2.09 3.58-5.17 3.58-8.72Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.88-3c-1.08.72-2.45 1.16-4.06 1.16-3.12 0-5.77-2.11-6.71-4.95H1.28v3.09A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.29 14.3a7.2 7.2 0 0 1 0-4.6V6.61H1.28a12 12 0 0 0 0 10.78l4.01-3.09Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.43-3.43C17.95 1.17 15.24 0 12 0A12 12 0 0 0 1.28 6.61l4.01 3.09C6.23 6.86 8.88 4.75 12 4.75Z"
      />
    </svg>
  );
});

function PollarLogin() {
  const searchParams = useSearchParams();
  const from = searchParams.get("from");
  const router = useRouter();
  const { login, getClient, verified, isAuthenticated } = usePollar();
  const logoutPollar = usePollarLogout();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [phase, setPhase] = useState<"methods" | "otp">("methods");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<"google" | "email" | "wallet" | "session" | null>(
    null
  );
  const exchangedToken = useRef<string | null>(null);

  const exchangeSession = useCallback(
    async (accessToken: string) => {
      if (exchangedToken.current === accessToken) return;
      exchangedToken.current = accessToken;
      setBusy("session");
      setError("");
      try {
        const res = await fetch("/api/auth/pollar/session", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token: accessToken,
            ...(from?.trim() ? { from } : {}),
          }),
        });
        const data = await readJsonSafely<SessionApiBody>(res);
        if (!res.ok || !data?.redirectTo || !data.role) {
          exchangedToken.current = null;
          logoutPollar();
          setError(data?.error || "No se pudo abrir la sesión de Tonki.");
          setBusy(null);
          return;
        }
        // El alta de empresa es obligatoria: `from` no puede saltarla.
        const target = data.requiresBusinessProfile
          ? null
          : sanitizeAuthReturnPath(from, data.role);
        router.push(target ?? data.redirectTo);
        router.refresh();
      } catch {
        exchangedToken.current = null;
        setError("No se pudo abrir la sesión de Tonki.");
        setBusy(null);
      }
    },
    [from, logoutPollar, router]
  );

  useEffect(() => {
    const client = getClient();
    return client.onAuthStateChange((state) => {
      if (state.step === "entering_code") {
        setPhase("otp");
        setBusy(null);
        return;
      }
      if (state.step === "wallet_not_installed") {
        setError("Freighter no está disponible. Instala la extensión.");
        setBusy(null);
        return;
      }
      if (state.step === "error") {
        setError(pollarErrorMessage(state));
        setBusy(null);
        return;
      }
      if (state.step === "authenticated" && state.verified) {
        void exchangeSession(state.session.token.accessToken);
      }
    });
  }, [exchangeSession, getClient]);

  useEffect(() => {
    if (!isAuthenticated || !verified) return;
    const state = getClient().getAuthState();
    if (state.step === "authenticated" && state.verified) {
      void exchangeSession(state.session.token.accessToken);
    }
  }, [exchangeSession, getClient, isAuthenticated, verified]);

  const startGoogle = useCallback(() => {
    setError("");
    setBusy("google");
    login({ provider: "google" });
  }, [login]);

  const startEmail = useCallback(
    (event: FormEvent) => {
      event.preventDefault();
      const trimmed = email.trim();
      if (!trimmed.includes("@")) {
        setError("Escribe un correo válido.");
        return;
      }
      setError("");
      setBusy("email");
      login({ provider: "email", email: trimmed });
    },
    [email, login]
  );

  const submitCode = useCallback(
    (event: FormEvent) => {
      event.preventDefault();
      const trimmed = code.trim();
      if (!/^\d{4,8}$/.test(trimmed)) {
        setError("Escribe el código que te enviamos.");
        return;
      }
      setError("");
      setBusy("email");
      getClient().verifyEmailCode(trimmed);
    },
    [code, getClient]
  );

  const startWallet = useCallback(() => {
    setError("");
    setBusy("wallet");
    login({ provider: WalletType.FREIGHTER });
  }, [login]);

  const cancelOtp = useCallback(() => {
    getClient().cancelLogin();
    setPhase("methods");
    setCode("");
    setBusy(null);
    setError("");
  }, [getClient]);

  const disabled = busy !== null;

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <img
            src="/Logos-Tonki-SVG/Logo lateral caf-amarillo.svg"
            alt="Tonki"
            width={180}
            height={62}
            className="login-logo"
          />
        </div>

        {phase === "otp" ? (
          <form onSubmit={submitCode} className="login-form">
            <p className="login-register-intro">
              Te enviamos un código a <span className="login-mono">{email.trim()}</span>.
            </p>
            <label className="login-field-label" htmlFor="pollar-otp">
              Código
            </label>
            <input
              id="pollar-otp"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              className="login-input"
              placeholder="123456"
            />
            <button
              type="submit"
              disabled={disabled}
              className="login-btn login-btn-primary"
            >
              {busy === "email" ? "Verificando…" : "Verificar código"}
            </button>
            <button
              type="button"
              onClick={cancelOtp}
              disabled={disabled && busy !== null && busy !== "email"}
              className="login-btn login-btn-outline"
            >
              Usar otro método
            </button>
          </form>
        ) : (
          <>
            <form onSubmit={startEmail} className="login-form">
              <label className="login-field-label" htmlFor="pollar-email">
                Correo
              </label>
              <input
                id="pollar-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="login-input"
                placeholder="tu@correo.com"
              />
              <button
                type="submit"
                disabled={disabled}
                className="login-btn login-btn-primary"
              >
                {busy === "email" ? "Enviando código…" : "Continuar con correo"}
              </button>
            </form>

            <div className="login-divider">
              <hr className="login-divider-line" />
              <span className="login-divider-label">o</span>
              <hr className="login-divider-line" />
            </div>

            <button
              type="button"
              onClick={startGoogle}
              disabled={disabled}
              className="login-btn login-btn-outline login-btn-google"
            >
              <GoogleIcon />
              {busy === "google" ? "Conectando con Gmail…" : "Continuar con Gmail"}
            </button>

            <div className="login-divider">
              <hr className="login-divider-line" />
              <span className="login-divider-label">¿Ya tienes Wallet?</span>
              <hr className="login-divider-line" />
            </div>

            <button
              type="button"
              onClick={startWallet}
              disabled={disabled}
              className="login-btn login-btn-outline"
            >
              {busy === "wallet" ? "Conectando Freighter…" : "Conectar con Freighter"}
            </button>
          </>
        )}

        {busy === "session" ? (
          <p className="login-register-intro">Abriendo tu cuenta…</p>
        ) : null}
        {error ? <p className="login-error">{error}</p> : null}
      </div>
    </div>
  );
}

function MissingPollarConfig() {
  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <img
            src="/Logos-Tonki-SVG/Logo lateral caf-amarillo.svg"
            alt="Tonki"
            width={180}
            height={62}
            className="login-logo"
          />
        </div>
        <p className="login-error">
          Falta NEXT_PUBLIC_POLLAR_PUBLISHABLE_KEY. Crea la app en el dashboard de
          Pollar y agrega la clave publicable.
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  const configured = Boolean(readPollarPublishableKey());
  const ready = usePollarReady();

  if (!configured) return <MissingPollarConfig />;
  if (!ready) {
    return (
      <div className="login-fallback">
        <p className="login-fallback-text">Cargando…</p>
      </div>
    );
  }

  return (
    <Suspense
      fallback={
        <div className="login-fallback">
          <p className="login-fallback-text">Cargando…</p>
        </div>
      }
    >
      <PollarLogin />
    </Suspense>
  );
}
