import { Prisma } from "src/generated/prisma/client";

import {
  closeTransition,
  dynamicRecordSelect,
  toDynamicRecord,
  type DynamicRecord,
} from "src/lib/posts/dynamics/rules";

export async function evaluateAndCloseDynamic(
  tx: Prisma.TransactionClient,
  dynamicId: string,
  now: Date = new Date()
): Promise<DynamicRecord | null> {
  const row = await tx.postDynamic.findUnique({
    where: { dynamic_id: dynamicId },
    select: dynamicRecordSelect,
  });
  if (!row) return null;
  const dynamic = toDynamicRecord(row);
  if (!dynamic) return null;

  const next = closeTransition(dynamic, now);
  if (!next) return dynamic;

  const updated = await tx.postDynamic.updateMany({
    where: { dynamic_id: dynamicId, status: "active" },
    data: { status: next, closed_at: now },
  });
  if (updated.count === 1) {
    return { ...dynamic, status: next, closed_at: now };
  }

  const again = await tx.postDynamic.findUnique({
    where: { dynamic_id: dynamicId },
    select: dynamicRecordSelect,
  });
  return again ? toDynamicRecord(again) : null;
}
