import prisma from "src/lib/db";
import { apiError, apiSuccess } from "src/lib/api/response";
import { verifySession } from "src/lib/auth/session";
import { awardScanCashback } from "src/lib/mesero/awardScanCashback";
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

export async function POST(req: Request, context: RouteContext) {
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

    const existing = await prisma.waiterBillQr.findUnique({
      where: { bill_qr_id: billId },
      include: {
        creator: { select: billUserSelect },
        scanner: { select: billUserSelect },
      },
    });

    if (!existing) {
      return apiError("Cuenta no encontrada", 404);
    }

    // Ya escaneado: idempotente, no sobrescribir ni re-acreditar
    if (existing.scanned_by_user_id) {
      return apiSuccess(formatBillQr(existing, requestOrigin(req)));
    }

    // Evitar que el creador se auto-registre como escáner
    if (existing.created_by_user_id === session.userId) {
      return apiSuccess(formatBillQr(existing, requestOrigin(req)));
    }

    const claimed = await prisma.waiterBillQr.updateMany({
      where: {
        bill_qr_id: billId,
        scanned_by_user_id: null,
      },
      data: {
        scanned_by_user_id: session.userId,
        scanned_at: new Date(),
      },
    });

    if (claimed.count === 1) {
      try {
        await awardScanCashback({
          billQrId: billId,
          totalAmount: existing.total_amount,
          scannerUserId: session.userId,
          creatorUserId: existing.created_by_user_id,
        });
      } catch (awardErr) {
        console.error(
          "[mesero/bills/[billId]/scan POST] cashback failed",
          awardErr
        );
      }
    }

    const updated = await prisma.waiterBillQr.findUnique({
      where: { bill_qr_id: billId },
      include: {
        creator: { select: billUserSelect },
        scanner: { select: billUserSelect },
      },
    });

    if (!updated) {
      return apiError("Cuenta no encontrada", 404);
    }

    return apiSuccess(formatBillQr(updated, requestOrigin(req)));
  } catch (err) {
    console.error("[mesero/bills/[billId]/scan POST]", err);
    return apiError("Error al registrar el escaneo", 500);
  }
}
