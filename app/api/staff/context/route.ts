import { logAndRespondAuthInfrastructureError } from "src/lib/api/authRouteCatch";
import { requireActiveStaffSession } from "src/lib/api/requireActiveStaff";
import { apiError, apiSuccess } from "src/lib/api/response";
import { mapProduct } from "src/lib/crm/mapProduct";
import prisma from "src/lib/db";
import type { StaffContext } from "src/lib/staff/types";

/** Negocio del mesero y su catálogo activo (solo lectura). */
export async function GET() {
  try {
    const gate = await requireActiveStaffSession();
    if (!gate.ok) return gate.response;

    const [establishment, products] = await Promise.all([
      prisma.establishment.findUnique({
        where: { establishment_id: gate.establishmentId },
        select: { name: true, cashback_percent: true },
      }),
      prisma.product.findMany({
        where: { establishment_id: gate.establishmentId, is_active: true },
        orderBy: { created_at: "desc" },
      }),
    ]);
    if (!establishment) {
      return apiError("El negocio todavía no está configurado.", 400);
    }

    const context: StaffContext = {
      establishment_name: establishment.name,
      cashback_percent: establishment.cashback_percent,
      staff_name: gate.staffName,
    };
    return apiSuccess({ context, products: products.map(mapProduct) });
  } catch (err) {
    const infra = logAndRespondAuthInfrastructureError("[api/staff/context GET]", err);
    if (infra) return infra;
    return apiError("Error al cargar el negocio", 500);
  }
}
