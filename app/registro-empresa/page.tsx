import type { Metadata } from "next";

import RegistroEmpresaForm from "./RegistroEmpresaForm";

export const metadata: Metadata = {
  title: "Registro de negocio — Tonki",
  description:
    "Crea la cuenta empresarial de tu establecimiento en Tonki. Fuera del flujo de la app para comensales.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function RegistroEmpresaPage() {
  return <RegistroEmpresaForm />;
}
