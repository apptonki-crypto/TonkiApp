import prisma from "src/lib/db";
import { apiError, apiSuccess } from "src/lib/api/response";
import { parseRequestJson } from "src/lib/api/readJsonSafely";
import { verifySession } from "src/lib/auth/session";
import { createWaiterBillSchema } from "src/lib/mesero/schemas";
import {
  billUserSelect,
  formatBillQr,
} from "src/lib/mesero/formatBillQr";

function requestOrigin(req: Request): string {
  const url = new URL(req.url);
  return url.origin;
}

export async function POST(req: Request) {
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

    const raw = await parseRequestJson(req);
    if (raw === null) {
      return apiError("Cuerpo JSON inválido", 400);
    }

    const parsed = createWaiterBillSchema.safeParse(raw);
    if (!parsed.success) {
      const message =
        parsed.error.issues[0]?.message ?? "Datos inválidos";
      return apiError(message, 400);
    }

    const bill = await prisma.waiterBillQr.create({
      data: {
        total_amount: parsed.data.total_amount,
        created_by_user_id: session.userId,
      },
      include: {
        creator: { select: billUserSelect },
        scanner: { select: billUserSelect },
      },
    });

    return apiSuccess(formatBillQr(bill, requestOrigin(req)), 201);
  } catch (err) {
    console.error("[mesero/bills POST]", err);
    return apiError("Error al crear la cuenta", 500);
  }
}
