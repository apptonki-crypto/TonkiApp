import { z } from "zod";

import prisma from "src/lib/db";
import { apiError, apiSuccess } from "src/lib/api/response";
import { requireActiveAdminSession } from "src/lib/api/requireActiveAdmin";
import { getPublicAppOrigin } from "src/lib/auth/publicAppOrigin";
import { renderChargeQrDataUrl } from "src/lib/charges/chargeQr";
import { dynamicClaimUrl } from "src/lib/posts/dynamicRequests";

const paramsSchema = z.object({
  postId: z.string().uuid(),
  dynamicId: z.string().uuid(),
});

export async function GET(
  req: Request,
  context: { params: Promise<{ postId: string; dynamicId: string }> }
) {
  try {
    const gate = await requireActiveAdminSession();
    if (!gate.ok) return gate.response;

    const params = paramsSchema.safeParse(await context.params);
    if (!params.success) return apiError("Dinámica inválida.", 400);

    const dynamic = await prisma.postDynamic.findFirst({
      where: {
        dynamic_id: params.data.dynamicId,
        post_id: params.data.postId,
      },
      select: {
        kind: true,
        token: true,
        post: { select: { author_id: true } },
      },
    });
    if (!dynamic) return apiError("Esta dinámica no existe.", 404);
    if (dynamic.post.author_id !== gate.userId) {
      return apiError("Prohibido", 403);
    }
    if (dynamic.kind !== "qr" || !dynamic.token) {
      return apiError("Esta dinámica no tiene código QR.", 409);
    }

    const qr_image = await renderChargeQrDataUrl(
      dynamicClaimUrl(getPublicAppOrigin(req), dynamic.token)
    );
    return apiSuccess({ qr_image });
  } catch {
    return apiError("Error al generar el código QR", 500);
  }
}
