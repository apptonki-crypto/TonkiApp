import prisma from "src/lib/db";

/** 1% of purchase total, rounded to nearest integer Tonki point. */
export function tonkisFromPurchaseTotal(totalAmount: number): number {
  if (!Number.isFinite(totalAmount) || totalAmount <= 0) return 0;
  return Math.max(0, Math.round(totalAmount * 0.01));
}

/**
 * Resolve establishment for loyalty Reward FK:
 * prefer one owned by the bill creator, else any establishment.
 */
async function resolveEstablishmentId(
  creatorUserId: string
): Promise<string | null> {
  const owned = await prisma.establishment.findFirst({
    where: { admin_id: creatorUserId },
    select: { establishment_id: true },
    orderBy: { created_at: "asc" },
  });
  if (owned) return owned.establishment_id;

  const any = await prisma.establishment.findFirst({
    select: { establishment_id: true },
    orderBy: { created_at: "asc" },
  });
  return any?.establishment_id ?? null;
}

/**
 * Creates a Reward for the scanner (1% cashback) and sets tonkis_awarded.
 * Caller must only invoke after this user successfully claimed the scan.
 */
export async function awardScanCashback(opts: {
  billQrId: string;
  totalAmount: number;
  scannerUserId: string;
  creatorUserId: string;
}): Promise<number> {
  const points = tonkisFromPurchaseTotal(opts.totalAmount);
  if (points <= 0) {
    return 0;
  }

  const establishmentId = await resolveEstablishmentId(opts.creatorUserId);
  if (!establishmentId) {
    console.warn(
      "[mesero/awardScanCashback] No establishment available; skipping Reward",
      { billQrId: opts.billQrId }
    );
    return 0;
  }

  await prisma.$transaction([
    prisma.reward.create({
      data: {
        user_id: opts.scannerUserId,
        establishment_id: establishmentId,
        title: "Cashback mesero (1%)",
        description: `Cashback 1% por cuenta ${opts.billQrId}`,
        points,
        status: "active",
      },
    }),
    prisma.waiterBillQr.update({
      where: { bill_qr_id: opts.billQrId },
      data: { tonkis_awarded: points },
    }),
  ]);

  return points;
}
