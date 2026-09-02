import prisma from "src/lib/db";
import { apiError, apiSuccess } from "src/lib/api/response";
import { verifySession } from "src/lib/auth/session";
import {
  billUserSelect,
  formatBillQr,
} from "src/lib/mesero/formatBillQr";

type RouteContext = {
  params: Promise<{ billId: string }>;
};

function requestOrigin(req: Request): string {
  return new URL(req.url).origin;
}

export async function GET(req: Request, context: RouteContext) {
  try {
    const session = await verifySession(req);
    if (!session) {
      return apiError("No autenticado", 401);
    }

    const account = await prisma.user.findUnique({
      where: { user_id: session.userId },
      select: { status: true },
    });
    if (!account || account.status !== "active") {
      return apiError("Cuenta suspendida", 403);
    }

    const { billId } = await context.params;
    if (!billId?.trim()) {
      return apiError("Identificador inválido", 400);
    }

    const bill = await prisma.waiterBillQr.findUnique({
      where: { bill_qr_id: billId },
      include: {
        creator: { select: billUserSelect },
        scanner: { select: billUserSelect },
      },
    });

    if (!bill) {
      return apiError("Cuenta no encontrada", 404);
    }

    return apiSuccess(formatBillQr(bill, requestOrigin(req)));
  } catch (err) {
    console.error("[mesero/bills/[billId] GET]", err);
    return apiError("Error al cargar la cuenta", 500);
  }
}
