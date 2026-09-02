import type { BillQrPayload } from "./types";

type UserNameFields = {
  first_name: string | null;
  name: string;
  email: string | null;
};

/** Mismo criterio de nombre visible que en rewards. */
export function displayUserName(user: UserNameFields): string {
  const first = user.first_name?.trim();
  if (first) return first;
  const full = user.name?.trim();
  if (full) return full;
  const emailLocal = user.email?.split("@")[0]?.trim();
  if (emailLocal) return emailLocal;
  return "Usuario";
}

type BillWithUsers = {
  bill_qr_id: string;
  total_amount: number;
  scanned_at: Date | null;
  tonkis_awarded?: number | null;
  creator: UserNameFields;
  scanner: UserNameFields | null;
};

export function formatBillQr(
  bill: BillWithUsers,
  origin: string
): BillQrPayload {
  const base = origin.replace(/\/$/, "");
  return {
    bill_id: bill.bill_qr_id,
    total: bill.total_amount,
    creator_name: displayUserName(bill.creator),
    scanner_name: bill.scanner ? displayUserName(bill.scanner) : null,
    scan_url: `${base}/pagar/${bill.bill_qr_id}`,
    scanned_at: bill.scanned_at ? bill.scanned_at.toISOString() : null,
    tonkis_awarded: Number(bill.tonkis_awarded) || 0,
  };
}

export const billUserSelect = {
  first_name: true,
  name: true,
  email: true,
} as const;
