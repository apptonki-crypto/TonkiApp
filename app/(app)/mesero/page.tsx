import type { Metadata } from "next";

import { MeseroTestView } from "./MeseroTestView";

export const metadata: Metadata = {
  title: "Tonki — Mesero (prueba QR)",
  description: "Genera un código QR de cuenta para prueba de pago en Tonki.",
};

export default function MeseroPage() {
  return <MeseroTestView />;
}
