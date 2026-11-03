import { logAndRespondAuthInfrastructureError } from "src/lib/api/authRouteCatch";
import { requireActiveAdminSession } from "src/lib/api/requireActiveAdmin";
import { apiError, apiSuccess } from "src/lib/api/response";
import { mapEstablishmentProfile } from "src/lib/establishment/mapProfile";
import {
  ESTABLISHMENT_GALLERY_LIMIT,
  EstablishmentImageUploadError,
  saveEstablishmentGalleryImage,
} from "src/lib/establishment/saveGalleryImage";
import prisma from "src/lib/db";

export async function POST(req: Request) {
  try {
    const gate = await requireActiveAdminSession();
    if (!gate.ok) return gate.response;

    const establishment = await prisma.establishment.findFirst({
      where: { admin_id: gate.userId },
      orderBy: { created_at: "asc" },
      include: { images: { select: { image_id: true, sort_order: true } } },
    });
    if (!establishment) {
      return apiError("Primero guarda los datos del negocio", 400);
    }
    if (establishment.images.length >= ESTABLISHMENT_GALLERY_LIMIT) {
      return apiError(
        `Puedes publicar hasta ${ESTABLISHMENT_GALLERY_LIMIT} imágenes`,
        400
      );
    }

    const form = await req.formData();
    const file = form.get("image");
    if (!(file instanceof File) || file.size === 0) {
      return apiError("Selecciona una imagen", 400);
    }

    let url: string;
    try {
      const saved = await saveEstablishmentGalleryImage(
        file,
        establishment.establishment_id
      );
      url = saved.url;
    } catch (err) {
      if (err instanceof EstablishmentImageUploadError) {
        return apiError(err.message, 400);
      }
      throw err;
    }

    const nextOrder =
      establishment.images.reduce(
        (max, image) => Math.max(max, image.sort_order),
        -1
      ) + 1;

    await prisma.establishmentImage.create({
      data: {
        establishment_id: establishment.establishment_id,
        url,
        sort_order: nextOrder,
      },
    });

    const refreshed = await prisma.establishment.findUniqueOrThrow({
      where: { establishment_id: establishment.establishment_id },
      include: {
        images: { orderBy: [{ sort_order: "asc" }, { created_at: "asc" }] },
      },
    });

    return apiSuccess({ establishment: mapEstablishmentProfile(refreshed) });
  } catch (err) {
    const infra = logAndRespondAuthInfrastructureError(
      "[api/establishment/images POST]",
      err
    );
    if (infra) return infra;
    return apiError("Error al subir la imagen", 500);
  }
}
