import { Prisma } from "src/generated/prisma/client";
import { logAndRespondAuthInfrastructureError } from "src/lib/api/authRouteCatch";
import { requireActiveAdminSession } from "src/lib/api/requireActiveAdmin";
import { parseRequestJson } from "src/lib/api/readJsonSafely";
import { apiError, apiSuccess } from "src/lib/api/response";
import { productUpdateSchema } from "src/lib/crm/schemas";
import { mapProduct } from "src/lib/crm/mapProduct";
import prisma from "src/lib/db";

type RouteContext = { params: Promise<{ productId: string }> };

export async function PATCH(req: Request, context: RouteContext) {
  try {
    const gate = await requireActiveAdminSession();
    if (!gate.ok) return gate.response;

    const { productId } = await context.params;
    if (!productId) {
      return apiError("Producto inválido", 400);
    }

    const existing = await prisma.product.findFirst({
      where: { product_id: productId, admin_id: gate.userId },
    });
    if (!existing) {
      return apiError("Producto no encontrado", 404);
    }

    const json = await parseRequestJson(req);
    if (!json || typeof json !== "object") {
      return apiError("Cuerpo inválido", 400);
    }

    const parsed = productUpdateSchema.safeParse(json);
    if (!parsed.success) {
      const first = parsed.error.issues[0]?.message ?? "Datos inválidos";
      return apiError(first, 400);
    }

    const data = parsed.data;
    const updated = await prisma.product.update({
      where: { product_id: productId },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.sku !== undefined ? { sku: data.sku ?? null } : {}),
        ...(data.description !== undefined
          ? { description: data.description ?? null }
          : {}),
        ...(data.unit_price !== undefined
          ? { unit_price: new Prisma.Decimal(data.unit_price) }
          : {}),
        ...(data.is_active !== undefined ? { is_active: data.is_active } : {}),
      },
    });

    return apiSuccess({ product: mapProduct(updated) });
  } catch (err) {
    const infra = logAndRespondAuthInfrastructureError(
      "[api/admin/crm/products PATCH]",
      err
    );
    if (infra) return infra;
    return apiError("Error al actualizar el producto", 500);
  }
}
