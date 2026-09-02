import type { Metadata } from "next";

import { PagarBillView } from "./PagarBillView";

type PageProps = {
  params: Promise<{ billId: string }>;
};

export const metadata: Metadata = {
  title: "Tonki — Pagar cuenta",
  description: "Confirma el escaneo de una cuenta generada por el mesero.",
};

export default async function PagarBillPage({ params }: PageProps) {
  const { billId } = await params;
  return <PagarBillView billId={billId} />;
}
