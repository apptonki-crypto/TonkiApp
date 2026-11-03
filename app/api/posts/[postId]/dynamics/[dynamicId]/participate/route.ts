import { z } from "zod";

import prisma from "src/lib/db";
import { apiError, apiSuccess } from "src/lib/api/response";
import { requireActiveClientSession } from "src/lib/api/requireActiveClient";
import { participateInDynamic } from "src/lib/posts/dynamics";
import { parseParticipateBody } from "src/lib/posts/dynamicRequests";

const paramsSchema = z.object({
  postId: z.string().uuid(),
  dynamicId: z.string().uuid(),
});

export async function POST(
  req: Request,
  context: { params: Promise<{ postId: string; dynamicId: string }> }
) {
  try {
    const gate = await requireActiveClientSession();
    if (!gate.ok) return gate.response;

    const params = paramsSchema.safeParse(await context.params);
    if (!params.success) return apiError("Dinámica inválida.", 400);

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return apiError("Cuerpo inválido", 400);
    }
    const parsed = parseParticipateBody(body);
    if (!parsed.ok) return apiError(parsed.error, parsed.status);

    const dynamic = await prisma.postDynamic.findFirst({
      where: {
        dynamic_id: params.data.dynamicId,
        post_id: params.data.postId,
      },
      select: { dynamic_id: true },
    });
    if (!dynamic) return apiError("Esta dinámica no existe.", 404);

    const result = await participateInDynamic({
      dynamicId: dynamic.dynamic_id,
      userId: gate.userId,
      source: parsed.source,
      code: parsed.code,
    });
    if (!result.ok) return apiError(result.error, result.status);

    return apiSuccess({
      message:
        parsed.source === "promo_code"
          ? "Código canjeado."
          : "Ya quedaste anotado.",
      dynamic: result.dynamic,
    });
  } catch {
    return apiError("Error al participar", 500);
  }
}
