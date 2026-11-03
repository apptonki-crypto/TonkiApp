import prisma from "src/lib/db";
import { logAndRespondAuthInfrastructureError } from "src/lib/api/authRouteCatch";
import { requireActiveAdminSession } from "src/lib/api/requireActiveAdmin";
import { apiError, apiSuccess } from "src/lib/api/response";
import {
  AvatarUploadError,
  saveAvatarUpload,
} from "src/lib/auth/saveAvatarUpload";
import {
  altitudeOrNull,
  decimalOrNull,
  mapEstablishmentProfile,
} from "src/lib/establishment/mapProfile";
import { establishmentUpsertSchema } from "src/lib/establishment/schemas";

function findAdminEstablishment(adminId: string) {
  return prisma.establishment.findFirst({
    where: { admin_id: adminId },
    orderBy: { created_at: "asc" },
    include: {
      images: {
        orderBy: [{ sort_order: "asc" }, { created_at: "asc" }],
      },
    },
  });
}

export async function GET() {
  try {
    const gate = await requireActiveAdminSession();
    if (!gate.ok) return gate.response;

    const establishment = await findAdminEstablishment(gate.userId);
    return apiSuccess({
      establishment: establishment ? mapEstablishmentProfile(establishment) : null,
    });
  } catch (err) {
    const infra = logAndRespondAuthInfrastructureError(
      "[api/establishment GET]",
      err
    );
    if (infra) return infra;
    return apiError("Error al cargar el negocio", 500);
  }
}

export async function PUT(req: Request) {
  try {
    const gate = await requireActiveAdminSession();
    if (!gate.ok) return gate.response;

    const contentType = req.headers.get("content-type") ?? "";
    let raw: Record<string, unknown>;
    let photoFile: File | null = null;

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      raw = {
        name: String(form.get("name") ?? ""),
        address: String(form.get("address") ?? ""),
        category: String(form.get("category") ?? ""),
        description: String(form.get("description") ?? ""),
        phone: String(form.get("phone") ?? ""),
        website: String(form.get("website") ?? ""),
        hours: String(form.get("hours") ?? ""),
        location_x: String(form.get("location_x") ?? ""),
        location_y: String(form.get("location_y") ?? ""),
        location_z: String(form.get("location_z") ?? ""),
        cashback_percent: String(form.get("cashback_percent") ?? ""),
      };
      const maybePhoto = form.get("photo");
      if (maybePhoto instanceof File && maybePhoto.size > 0) {
        photoFile = maybePhoto;
      }
    } else {
      try {
        raw = (await req.json()) as Record<string, unknown>;
      } catch {
        return apiError("Cuerpo inválido", 400);
      }
    }

    const parsed = establishmentUpsertSchema.safeParse(raw);
    if (!parsed.success) {
      const first = parsed.error.issues[0]?.message ?? "Datos inválidos";
      return apiError(first, 400);
    }

    const existing = await findAdminEstablishment(gate.userId);

    let avatar_url = existing?.avatar_url ?? null;
    if (photoFile) {
      try {
        const saved = await saveAvatarUpload(photoFile, gate.userId);
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

    const saved = existing
      ? await prisma.establishment.update({
          where: { establishment_id: existing.establishment_id },
          data,
          include: {
            images: {
              orderBy: [{ sort_order: "asc" }, { created_at: "asc" }],
            },
          },
        })
      : await prisma.establishment.create({
          data: {
            admin_id: gate.userId,
            ...data,
          },
          include: {
            images: {
              orderBy: [{ sort_order: "asc" }, { created_at: "asc" }],
            },
          },
        });

    return apiSuccess({
      message: existing ? "Negocio actualizado" : "Negocio creado",
      establishment: mapEstablishmentProfile(saved),
    });
  } catch (err) {
    const infra = logAndRespondAuthInfrastructureError(
      "[api/establishment PUT]",
      err
    );
    if (infra) return infra;
    return apiError("Error al guardar el negocio", 500);
  }
}
