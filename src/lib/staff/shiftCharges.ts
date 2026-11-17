import prisma from "src/lib/db";
import { renderChargeQrDataUrl } from "src/lib/charges/chargeQr";
import { CHARGE_STATUS_CREDITED } from "src/lib/charges/constants";
import { decimalToMoneyString } from "src/lib/crm/decimal";
import {
  centsFromPesosInput,
  tonkisFromAmountCents,
} from "src/lib/charges/tonkis";
import { STAFF_SHIFT_WINDOW_MS } from "src/lib/staff/constants";
import type { StaffShiftCharge } from "src/lib/staff/types";

export function shiftChargeStatus(
  row: { status: string; expires_at: Date },
  now: Date
): StaffShiftCharge["status"] {
  if (row.status === CHARGE_STATUS_CREDITED) return "credited";
  if (row.expires_at.getTime() <= now.getTime()) return "expired";
  return "pending";
}

/**
 * QR que generó este mesero en las últimas horas, del más nuevo al más viejo.
 * Los vigentes traen otra vez la imagen del QR para volver a mostrarla.
 */
export async function listStaffShiftCharges(input: {
  staffUserId: string;
  adminId: string;
  origin: string;
  now?: Date;
}): Promise<(StaffShiftCharge & { qr_image: string | null })[]> {
  const now = input.now ?? new Date();
  const rows = await prisma.charge.findMany({
    where: {
      created_by_staff_id: input.staffUserId,
      admin_id: input.adminId,
      created_at: { gte: new Date(now.getTime() - STAFF_SHIFT_WINDOW_MS) },
    },
    orderBy: { created_at: "desc" },
    take: 100,
    select: {
      token: true,
      amount: true,
      cashback_percent: true,
      status: true,
      expires_at: true,
      created_at: true,
    },
  });

  return Promise.all(
    rows.map(async (row) => {
      const amount = decimalToMoneyString(row.amount);
      const cents = centsFromPesosInput(amount) ?? 0;
      const status = shiftChargeStatus(row, now);
      const url = `${input.origin}/cobro/${row.token}`;
      return {
        token: row.token,
        url,
        amount,
        points: tonkisFromAmountCents(cents, row.cashback_percent),
        status,
        expires_at: row.expires_at.toISOString(),
        created_at: row.created_at.toISOString(),
        qr_image: status === "pending" ? await renderChargeQrDataUrl(url) : null,
      };
    })
  );
}
