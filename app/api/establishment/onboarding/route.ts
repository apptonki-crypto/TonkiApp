import prisma from "src/lib/db";
import { logAndRespondAuthInfrastructureError } from "src/lib/api/authRouteCatch";
import { requireActiveAdminSession } from "src/lib/api/requireActiveAdmin";
import { apiError, apiSuccess } from "src/lib/api/response";
import {
  AvatarUploadError,
  saveAvatarUpload,
} from "src/lib/auth/saveAvatarUpload";
import { requiresBusinessProfile } from "src/lib/auth/businessProfile";
import {
  altitudeOrNull,
  decimalOrNull,
  mapEstablishmentProfile,
} from "src/lib/establishment/mapProfile";
import { readEstablishmentRequest } from "src/lib/establishment/parseRequest";
import { establishmentOnboardingSchema } from "src/lib/establishment/schemas";

const IMAGES_INCLUDE = {
  images: {
    orderBy: [{ sort_order: "asc" as const }, { created_at: "asc" as const }],
  },
};

/**
 * Alta obligatoria de la empresa. Guarda el establecimiento y marca el perfil
 * como completado; una vez marcado, esta ruta ya no se puede usar de nuevo.
 */
export async function POST(req: Request) {
  try {
    const gate = await requireActiveAdminSession();
    if (!gate.ok) return gate.response;

    const user = await prisma.user.findUnique({
      where: { user_id: gate.userId },
      select: { type: true, business_profile_completed_at: true },
    });
    if (!user || !requiresBusinessProfile(user)) {
      return apiError("El perfil de tu empresa ya está completo", 409);
    }

    const body = await readEstablishmentRequest(req);
    if (!body) return apiError("Cuerpo inválido", 400);

    const parsed = establishmentOnboardingSchema.safeParse(body.raw);
    if (!parsed.success) {
      const first = parsed.error.issues[0]?.message ?? "Datos inválidos";
      return apiError(first, 400);
    }

    const existing = await prisma.establishment.findFirst({
      where: { admin_id: gate.userId },
      orderBy: { created_at: "asc" },
    });

    let avatar_url = existing?.avatar_url ?? null;
    if (body.photoFile) {
      try {
        const saved = await saveAvatarUpload(body.photoFile, gate.userId);
        avatar_url = saved.url;
      } catch (err) {
        if (err instanceof AvatarUploadError) {
          return apiError(err.message, 400);
        }
        throw err;
      }
    }

    const data = {
      name: parsed.data.name,
      address: parsed.data.address,
      category: parsed.data.category,
      description: parsed.data.description,
      phone: parsed.data.phone,
      website: parsed.data.website,
      hours: parsed.data.hours,
      location_x: decimalOrNull(parsed.data.location_x),
      location_y: decimalOrNull(parsed.data.location_y),
      location_z: altitudeOrNull(parsed.data.location_z),
      avatar_url,
      cashback_percent: parsed.data.cashback_percent,
    };

    const saved = await prisma.$transaction(async (tx) => {
      const marked = await tx.user.updateMany({
        where: { user_id: gate.userId, business_profile_completed_at: null },
        data: { business_profile_completed_at: new Date() },
      });
      if (marked.count === 0) return null;

      return existing
        ? tx.establishment.update({
            where: { establishment_id: existing.establishment_id },
            data,
            include: IMAGES_INCLUDE,
          })
        : tx.establishment.create({
            data: { admin_id: gate.userId, ...data },
            include: IMAGES_INCLUDE,
          });
    });

    if (!saved) {
      return apiError("El perfil de tu empresa ya está completo", 409);
    }

    return apiSuccess({
      message: "Perfil de empresa completado",
      establishment: mapEstablishmentProfile(saved),
    });
  } catch (err) {
    const infra = logAndRespondAuthInfrastructureError(
      "[api/establishment/onboarding POST]",
      err
    );
    if (infra) return infra;
    return apiError("Error al guardar el perfil de empresa", 500);
  }
}
