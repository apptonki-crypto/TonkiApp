export type EstablishmentRequestBody = {
  raw: Record<string, unknown>;
  photoFile: File | null;
};

const FORM_KEYS = [
  "name",
  "address",
  "category",
  "description",
  "phone",
  "website",
  "hours",
  "location_x",
  "location_y",
  "location_z",
  "cashback_percent",
] as const;

/** Lee el cuerpo (multipart o JSON) de las rutas de establecimiento; null si es inválido. */
export async function readEstablishmentRequest(
  req: Request
): Promise<EstablishmentRequestBody | null> {
  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const raw: Record<string, unknown> = {};
    for (const key of FORM_KEYS) {
      raw[key] = String(form.get(key) ?? "");
    }
    const maybePhoto = form.get("photo");
    const photoFile =
      maybePhoto instanceof File && maybePhoto.size > 0 ? maybePhoto : null;
    return { raw, photoFile };
  }
  try {
    return {
      raw: (await req.json()) as Record<string, unknown>,
      photoFile: null,
    };
  } catch {
    return null;
  }
}
