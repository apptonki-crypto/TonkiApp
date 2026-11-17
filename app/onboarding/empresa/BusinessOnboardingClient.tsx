"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";

import { BusinessProfileSection } from "../../(app)/account/BusinessProfileSection";

export function BusinessOnboardingClient() {
  const router = useRouter();

  const handleCompleted = useCallback(() => {
    router.replace("/admin/dashboard");
    router.refresh();
  }, [router]);

  return (
    <main className="min-h-screen bg-tonki-canvas px-4 py-8 text-tonki-text sm:px-6">
      <div className="mx-auto w-full max-w-2xl">
        <img
          src="/Logos-Tonki-SVG/Logo lateral caf-amarillo.svg"
          alt="Tonki"
          width={160}
          height={55}
          className="mx-auto mb-6"
        />
        <p className="text-center text-sm font-semibold uppercase tracking-wide text-tonki-text-muted">
          Cuenta de empresa
        </p>
        <h1 className="mt-2 text-center text-2xl font-bold tracking-tight sm:text-3xl">
          Completa el perfil de tu empresa
        </h1>
        <p className="mx-auto mt-2 max-w-md text-center text-sm text-tonki-text-muted">
          Es obligatorio para empezar a usar Tonki. Lo verán tus clientes en la
          página de tu negocio.
        </p>
        <BusinessProfileSection mode="onboarding" onCompleted={handleCompleted} />
      </div>
    </main>
  );
}
