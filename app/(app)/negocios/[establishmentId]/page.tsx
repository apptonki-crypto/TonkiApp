import { redirect } from "next/navigation";

type PageProps = { params: Promise<{ establishmentId: string }> };

export default async function NegocioPage({ params }: PageProps) {
  const { establishmentId } = await params;
  redirect(`/negocios?lugar=${encodeURIComponent(establishmentId)}`);
}
