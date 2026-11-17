import { readJsonSafely } from "src/lib/api/readJsonSafely";

export type PresentationQr = {
  establishment_id: string;
  establishment_name: string;
  url: string;
  qr_image: string;
};

type Body =
  | { success: true; presentation: PresentationQr }
  | { success: false; error?: string };

export type PresentationFetchResult =
  | { ok: true; presentation: PresentationQr }
  | { ok: false; error: string };

/** GET carga (y crea la primera vez) el QR; POST genera uno nuevo e invalida el anterior. */
export async function fetchPresentationQr(
  method: "GET" | "POST" = "GET"
): Promise<PresentationFetchResult> {
  try {
    const res = await fetch("/api/establishment/presentation", {
      method,
      credentials: "include",
    });
    const data = await readJsonSafely<Body>(res);
    if (!res.ok || !data?.success) {
      return {
        ok: false,
        error:
          data && "error" in data && data.error
            ? data.error
            : "No se pudo cargar el QR de presentación",
      };
    }
    return { ok: true, presentation: data.presentation };
  } catch {
    return { ok: false, error: "No se pudo cargar el QR de presentación" };
  }
}
