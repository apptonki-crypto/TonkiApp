import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";

const MAX_BYTES = 2 * 1024 * 1024;
export const ESTABLISHMENT_GALLERY_LIMIT = 8;

const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/gif": ".gif",
  "image/webp": ".webp",
};

export class EstablishmentImageUploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EstablishmentImageUploadError";
  }
}

export async function saveEstablishmentGalleryImage(
  file: File,
  establishmentId: string
): Promise<{ url: string }> {
  const mime = (file.type || "application/octet-stream").toLowerCase();
  const ext = MIME_TO_EXT[mime];
  if (!ext) {
    throw new EstablishmentImageUploadError(
      "Formato no permitido. Usa JPG, PNG, GIF o WebP"
    );
  }
  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.length > MAX_BYTES) {
    throw new EstablishmentImageUploadError("Imagen demasiado grande (máx. 2 MB)");
  }

  const filename = `place-${randomUUID().slice(0, 8)}${ext}`;
  const dir = path.join(
    process.cwd(),
    "public",
    "uploads",
    "establishments",
    establishmentId
  );
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, filename), buf);
  return { url: `/uploads/establishments/${establishmentId}/${filename}` };
}
