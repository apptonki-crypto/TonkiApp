import { logAndRespondAuthInfrastructureError } from "src/lib/api/authRouteCatch";
import { requireActiveAdminSession } from "src/lib/api/requireActiveAdmin";
import { apiError, apiSuccess } from "src/lib/api/response";
import { mapEstablishmentProfile } from "src/lib/establishment/mapProfile";
import prisma from "src/lib/db";

type RouteContext = { params: Promise<{ imageId: string }> };

export async function DELETE(_req: Request, context: RouteContext) {
  try {
    const gate = await requireActiveAdminSession();
    if (!gate.ok) return gate.response;

    const { imageId } = await context.params;
    const image = await prisma.establishmentImage.findFirst({
      where: {
        image_id: imageId,
        establishment: { admin_id: gate.userId },
      },
      select: { image_id: true, establishment_id: true },
    });
    if (!image) return apiError("Imagen no encontrada", 404);

    await prisma.establishmentImage.delete({
      where: { image_id: image.image_id },
    });

    const refreshed = await prisma.establishment.findUniqueOrThrow({
      where: { establishment_id: image.establishment_id },
      include: {
        images: { orderBy: [{ sort_order: "asc" }, { created_at: "asc" }] },
      },
    });

    return apiSuccess({ establishment: mapEstablishmentProfile(refreshed) });
  } catch (err) {
    const infra = logAndRespondAuthInfrastructureError(
      "[api/establishment/images DELETE]",
      err
    );
    if (infra) return infra;
    return apiError("Error al quitar la imagen", 500);
  }
}
