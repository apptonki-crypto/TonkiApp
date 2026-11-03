import type { Metadata } from "next";
import { BorradorLanding } from "@/src/components/landing/BorradorLanding";

export const metadata: Metadata = {
  title: "Tonki — Recompensas que conectan",
  description:
    "Tonki ayuda a los negocios a fidelizar clientes y a las personas a ganar recompensas en sus lugares favoritos.",
};

export default function Home() {
  return <BorradorLanding />;
}
