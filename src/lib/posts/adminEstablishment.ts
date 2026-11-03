import prisma from "src/lib/db";

/** Primer establecimiento del admin, igual que `GET /api/establishment`. */
export async function findFirstAdminEstablishmentId(
  adminId: string
): Promise<string | null> {
  const row = await prisma.establishment.findFirst({
    where: { admin_id: adminId },
    orderBy: { created_at: "asc" },
    select: { establishment_id: true },
  });
  return row?.establishment_id ?? null;
}
