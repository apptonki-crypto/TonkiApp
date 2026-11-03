import { Prisma } from "src/generated/prisma/client";
import { logAndRespondAuthInfrastructureError } from "src/lib/api/authRouteCatch";
import { requireActiveAdminSession } from "src/lib/api/requireActiveAdmin";
import { parseRequestJson } from "src/lib/api/readJsonSafely";
import { apiError, apiSuccess } from "src/lib/api/response";
import { productCreateSchema } from "src/lib/crm/schemas";
import { mapProduct } from "src/lib/crm/mapProduct";
import prisma from "src/lib/db";

export async function GET(req: Request) {
  try {
    const gate = await requireActiveAdminSession();
    if (!gate.ok) return gate.response;

    const establishment = await prisma.establishment.findFirst({
      where: { admin_id: gate.userId },
      orderBy: { created_at: "asc" },
      select: { establishment_id: true },
    });
    if (!establishment) {
      return apiError("No tienes un establecimiento configurado", 400);
    }

    const url = new URL(req.url);
    const includeInactive = url.searchParams.get("include_inactive") === "1";

    const products = await prisma.product.findMany({
      where: {
        establishment_id: establishment.establishment_id,
        ...(includeInactive ? {} : { is_active: true }),
      },
      orderBy: [{ is_active: "desc" }, { created_at: "desc" }],
    });

    return apiSuccess({ products: products.map(mapProduct) });
  } catch (err) {
    const infra = logAndRespondAuthInfrastructureError(
      "[api/admin/crm/products GET]",
      err
    );
    if (infra) return infra;
    return apiError("Error al listar productos", 500);
  }
}

export async function POST(req: Request) {
  try {
    const gate = await requireActiveAdminSession();
    if (!gate.ok) return gate.response;

    const establishment = await prisma.establishment.findFirst({
      where: { admin_id: gate.userId },
      orderBy: { created_at: "asc" },
      select: { establishment_id: true },
    });
    if (!establishment) {
      return apiError("No tienes un establecimiento configurado", 400);
    }

    const json = await parseRequestJson(req);
    if (!json || typeof json !== "object") {
      return apiError("Cuerpo inválido", 400);
    }

    const parsed = productCreateSchema.safeParse(json);
    if (!parsed.success) {
      const first = parsed.error.issues[0]?.message ?? "Datos inválidos";
      return apiError(first, 400);
    }

    const { name, sku, description, unit_price } = parsed.data;

    const created = await prisma.product.create({
      data: {
        establishment_id: establishment.establishment_id,
        admin_id: gate.userId,
        name,
        sku: sku ?? null,
        description: description ?? null,
        unit_price: new Prisma.Decimal(unit_price),
      },
    });

    return apiSuccess({ product: mapProduct(created) });
  } catch (err) {
    const infra = logAndRespondAuthInfrastructureError(
      "[api/admin/crm/products POST]",
      err
    );
    if (infra) return infra;
    return apiError("Error al crear el producto", 500);
  }
}
