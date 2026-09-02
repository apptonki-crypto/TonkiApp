export type BillQrPayload = {
  bill_id: string;
  total: number;
  creator_name: string;
  scanner_name: string | null;
  scan_url: string;
  scanned_at: string | null;
  /** Tonkis awarded to the scanner (1% of total), 0 if none yet. */
  tonkis_awarded: number;
};

export type BillQrSuccessBody = BillQrPayload & { success: true };

export type BillQrErrorBody = {
  success: false;
  error?: string;
};
