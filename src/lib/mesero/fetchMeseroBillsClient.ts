import { readJsonSafely } from "src/lib/api/readJsonSafely";

import type { BillQrPayload, BillQrSuccessBody } from "./types";

export type MeseroBillResult =
  | { ok: true; bill: BillQrPayload }
  | { ok: false; error: string; unauthorized?: true; notFound?: true };

function parseBillBody(
  body: (BillQrSuccessBody & { error?: string }) | null,
  res: Response
): MeseroBillResult {
  if (body === null) {
    return { ok: false, error: "Respuesta inválida del servidor" };
  }

  if (res.status === 401) {
    return { ok: false, error: "No autenticado", unauthorized: true };
  }

  if (res.status === 404) {
    return {
      ok: false,
      error: body.error || "Cuenta no encontrada",
      notFound: true,
    };
  }

  if (!res.ok) {
    return { ok: false, error: body.error || `Error ${res.status}` };
  }

  if (
    typeof body.bill_id !== "string" ||
    typeof body.total !== "number" ||
    typeof body.scan_url !== "string"
  ) {
    return { ok: false, error: "Formato de datos inesperado" };
  }

  return {
    ok: true,
    bill: {
      bill_id: body.bill_id,
      total: body.total,
      creator_name: body.creator_name,
      scanner_name: body.scanner_name ?? null,
      scan_url: body.scan_url,
      scanned_at: body.scanned_at ?? null,
      tonkis_awarded:
        typeof body.tonkis_awarded === "number" ? body.tonkis_awarded : 0,
    },
  };
}

export async function createMeseroBill(opts: {
  total_amount: number;
}): Promise<MeseroBillResult> {
  try {
    const res = await fetch("/api/mesero/bills", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ total_amount: opts.total_amount }),
    });

    const body = await readJsonSafely<
      BillQrSuccessBody & { error?: string }
    >(res);
    return parseBillBody(body, res);
  } catch {
    return { ok: false, error: "No se pudo crear la cuenta" };
  }
}

export async function fetchMeseroBill(
  billId: string
): Promise<MeseroBillResult> {
  try {
    const res = await fetch(`/api/mesero/bills/${encodeURIComponent(billId)}`, {
      credentials: "include",
      cache: "no-store",
    });

    const body = await readJsonSafely<
      BillQrSuccessBody & { error?: string }
    >(res);
    return parseBillBody(body, res);
  } catch {
    return { ok: false, error: "No se pudo cargar la cuenta" };
  }
}

export async function scanMeseroBill(
  billId: string
): Promise<MeseroBillResult> {
  try {
    const res = await fetch(
      `/api/mesero/bills/${encodeURIComponent(billId)}/scan`,
      {
        method: "POST",
        credentials: "include",
      }
    );

    const body = await readJsonSafely<
      BillQrSuccessBody & { error?: string }
    >(res);
    return parseBillBody(body, res);
  } catch {
    return { ok: false, error: "No se pudo registrar el escaneo" };
  }
}
