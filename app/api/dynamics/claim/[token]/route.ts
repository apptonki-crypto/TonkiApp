import prisma from "src/lib/db";
import { apiError, apiSuccess } from "src/lib/api/response";
import { requireActiveClientSession } from "src/lib/api/requireActiveClient";
import { participateInDynamic } from "src/lib/posts/dynamics";
import { isDynamicClaimToken } from "src/lib/posts/dynamicRequests";

export async function POST(
  _req: Request,
  context: { params: Promise<{ token: string }> }
) {
  try {
    const gate = await requireActiveClientSession();
    if (!gate.ok) return gate.response;

    const { token } = await context.params;
    if (!isDynamicClaimToken(token)) {
      return apiError("Esta dinámica no existe.", 404);
    }

    const dynamic = await prisma.postDynamic.findUnique({
      where: { token },
      select: { dynamic_id: true },
    });
    if (!dynamic) return apiError("Esta dinámica no existe.", 404);

    const result = await participateInDynamic({
      dynamicId: dynamic.dynamic_id,
      userId: gate.userId,
      source: "qr",
    });
    if (!result.ok) return apiError(result.error, result.status);

    return apiSuccess({
      message: "Participación registrada.",
      dynamic: result.dynamic,
    });
  } catch {
    return apiError("Error al participar", 500);
  }
}
