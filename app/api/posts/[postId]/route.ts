import { rm, unlink } from "fs/promises";
import path from "path";

import { z } from "zod";

import prisma from "src/lib/db";
import { apiError, apiSuccess } from "src/lib/api/response";
import { requireActiveAdminSession } from "src/lib/api/requireActiveAdmin";
import { getSessionFromCookies } from "src/lib/auth/session";
import { PostUploadError, savePostUpload } from "src/lib/posts/savePostUpload";
import { resolveSafePostAttachmentPath } from "src/lib/posts/resolveSafePostAttachmentPath";
import {
  POST_MAX_ATTACHMENTS,
  postUploadMaxSizeLabelEs,
} from "src/lib/posts/constants";
import {
  POST_BODY_MAX_CHARS,
  POST_TITLE_MAX_CHARS,
  updatePostFormFieldsSchema,
} from "src/lib/posts/schemas";
import { findFirstAdminEstablishmentId } from "src/lib/posts/adminEstablishment";
import {
  applyDynamicPatch,
  listExistingDynamics,
} from "src/lib/posts/applyPostDynamics";
import {
  PostDynamicRequestError,
  interpretDynamicsPatch,
  type ParsedDynamicsPatch,
} from "src/lib/posts/dynamicRequests";
import { loadPublicDynamicsForPost } from "src/lib/posts/loadPublicDynamics";
import { scheduleChainWork } from "src/lib/posts/chain/schedule";

const postIdParamSchema = z.string().uuid();

const removedIdsSchema = z.array(z.string().uuid()).max(20);

const jsonPatchSchema = z.object({
  title: z.string().trim().min(1).max(POST_TITLE_MAX_CHARS).optional(),
  body: z.union([z.string().max(POST_BODY_MAX_CHARS), z.null()]).optional(),
  removedAttachmentIds: removedIdsSchema.optional(),
  dynamics: z.unknown().optional(),
});

type IncomingPatch = {
  title: string;
  body: string | null;
  removedAttachmentIds: string[];
  newFiles: File[];
  dynamicsRaw: unknown | undefined;
};

function emptyBody(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function readIncomingPatch(
  req: Request,
  existing: { title: string; body: string | null }
): Promise<
  { ok: true; data: IncomingPatch } | { ok: false; response: Response }
> {
  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return { ok: false, response: apiError("Cuerpo inválido", 400) };
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return { ok: false, response: apiError("Cuerpo inválido", 400) };
    }
    const parsed = jsonPatchSchema.safeParse(body);
    if (!parsed.success) {
      const invalidRemoved = parsed.error.issues.some(
        (issue) => issue.path[0] === "removedAttachmentIds"
      );
      return {
        ok: false,
        response: apiError(
          invalidRemoved
            ? "removedAttachmentIds inválido"
            : "Título o cuerpo inválido",
          400
        ),
      };
    }
    const hasDynamics = Object.prototype.hasOwnProperty.call(body, "dynamics");
    return {
      ok: true,
      data: {
        title: parsed.data.title ?? existing.title,
        body:
          parsed.data.body === undefined
            ? existing.body
            : emptyBody(parsed.data.body),
        removedAttachmentIds: parsed.data.removedAttachmentIds ?? [],
        newFiles: [],
        dynamicsRaw: hasDynamics ? parsed.data.dynamics : undefined,
      },
    };
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return { ok: false, response: apiError("Cuerpo multipart inv?lido", 400) };
  }

  const titleRaw = formData.get("title");
  const bodyRaw = formData.get("body");
  const bodyForSchema =
    typeof bodyRaw === "string" && bodyRaw.trim().length > 0
      ? bodyRaw
      : undefined;

  const fieldsParsed = updatePostFormFieldsSchema.safeParse({
    title: typeof titleRaw === "string" ? titleRaw : "",
    body: bodyForSchema,
  });
  if (!fieldsParsed.success) {
    return { ok: false, response: apiError("T?tulo o cuerpo inv?lido", 400) };
  }

  const dynamicsField = formData.get("dynamics");
  if (dynamicsField != null && typeof dynamicsField !== "string") {
    return { ok: false, response: apiError("Dinámicas inválidas.", 400) };
  }

  let removedAttachmentIds: string[] = [];
  const removedRaw = formData.get("removedAttachmentIds");
  if (typeof removedRaw === "string" && removedRaw.trim()) {
    try {
      const parsedJson: unknown = JSON.parse(removedRaw);
      const arr = removedIdsSchema.safeParse(parsedJson);
      if (!arr.success) {
        return {
          ok: false,
          response: apiError("removedAttachmentIds inv?lido", 400),
        };
      }
      removedAttachmentIds = arr.data;
    } catch {
      return {
        ok: false,
        response: apiError("removedAttachmentIds inv?lido", 400),
      };
    }
  }

  const rawBody = fieldsParsed.data.body;
  return {
    ok: true,
    data: {
      title: fieldsParsed.data.title,
      body:
        rawBody !== undefined && rawBody.trim().length > 0
          ? rawBody.trim()
          : null,
      removedAttachmentIds,
      newFiles: formData
        .getAll("files")
        .filter((file): file is File => file instanceof File && file.size > 0),
      dynamicsRaw: typeof dynamicsField === "string" ? dynamicsField : undefined,
    },
  };
}

async function respondWithDynamics(
  userId: string,
  postId: string,
  payload: {
    message: string;
    post_id: string;
    updated_at: string;
    was_edited: boolean;
  }
) {
  const dynamics = await loadPublicDynamicsForPost(postId, userId, undefined, {
    includeAuthorCode: true,
  });
  return apiSuccess({ ...payload, dynamics });
}

export async function GET(
  _req: Request,
  context: { params: Promise<{ postId: string }> }
) {
  try {
    const session = await getSessionFromCookies();
    if (!session) return apiError("No autenticado", 401);

    const account = await prisma.user.findUnique({
      where: { user_id: session.userId },
      select: { status: true },
    });
    if (!account || account.status !== "active") {
      return apiError("Cuenta suspendida", 403);
    }

    const { postId } = await context.params;
    const pid = postIdParamSchema.safeParse(postId);
    if (!pid.success) {
      return apiError("Post inv?lido", 400);
    }

    const post = await prisma.post.findUnique({
      where: { post_id: pid.data },
      select: {
        post_id: true,
        title: true,
        body: true,
        view_count: true,
        share_count: true,
        created_at: true,
        updated_at: true,
        content_edited_at: true,
        author: {
          select: { user_id: true, name: true, avatar_url: true },
        },
        attachments: {
          select: {
            attachment_id: true,
            url: true,
            mime_type: true,
            original_name: true,
          },
        },
      },
    });
    if (!post) return apiError("Publicaci?n no encontrada", 404);

    const viewerIsAuthor = post.author.user_id === session.userId;
    const dynamics = await loadPublicDynamicsForPost(
      post.post_id,
      session.userId,
      undefined,
      { includeAuthorCode: viewerIsAuthor }
    );

    return apiSuccess({
      post: {
        post_id: post.post_id,
        title: post.title,
        body: post.body ?? null,
        view_count: post.view_count,
        share_count: post.share_count,
        created_at: post.created_at.toISOString(),
        updated_at: post.updated_at.toISOString(),
        was_edited: post.content_edited_at != null,
        author: {
          user_id: post.author.user_id,
          name: post.author.name,
          avatar_url: post.author.avatar_url,
        },
        attachments: post.attachments.map((a) => ({
          attachment_id: a.attachment_id,
          url: a.url,
          mime_type: a.mime_type,
          original_name: a.original_name,
        })),
        dynamics,
      },
    });
  } catch {
    return apiError("Error al cargar la publicaci?n", 500);
  }
}

export async function PATCH(
  req: Request,
  context: { params: Promise<{ postId: string }> }
) {
  try {
    const gate = await requireActiveAdminSession();
    if (!gate.ok) return gate.response;
    const userId = gate.userId;

    const { postId } = await context.params;
    const pid = postIdParamSchema.safeParse(postId);
    if (!pid.success) {
      return apiError("Post inv?lido", 400);
    }

    const existingPost = await prisma.post.findUnique({
      where: { post_id: pid.data },
      select: {
        author_id: true,
        title: true,
        body: true,
        content_edited_at: true,
        updated_at: true,
      },
    });
    if (!existingPost) {
      return apiError("Publicaci?n no encontrada", 404);
    }
    if (existingPost.author_id !== userId) {
      return apiError("Prohibido", 403);
    }

    const incoming = await readIncomingPatch(req, {
      title: existingPost.title,
      body: existingPost.body ?? null,
    });
    if (!incoming.ok) return incoming.response;

    const title = incoming.data.title;
    const body = incoming.data.body;
    const uniqueRemovedIds = [...new Set(incoming.data.removedAttachmentIds)];
    const newFiles = incoming.data.newFiles;
    const attachmentMutation =
      uniqueRemovedIds.length > 0 || newFiles.length > 0;
    const sameText =
      existingPost.title === title && (existingPost.body ?? null) === body;

    let dynamicPatch: ParsedDynamicsPatch | null = null;
    let dynamicsChange = false;
    if (incoming.data.dynamicsRaw !== undefined) {
      const [existingDynamics, establishmentId] = await Promise.all([
        listExistingDynamics(pid.data),
        findFirstAdminEstablishmentId(userId),
      ]);
      const interpreted = interpretDynamicsPatch(
        incoming.data.dynamicsRaw,
        existingDynamics,
        establishmentId
      );
      if (!interpreted.ok) {
        return apiError(interpreted.error, interpreted.status);
      }
      dynamicPatch = interpreted.patch;
      dynamicsChange = interpreted.ops.length > 0;
    }

    if (!attachmentMutation && sameText && !dynamicsChange) {
      return respondWithDynamics(userId, pid.data, {
        message: "Sin cambios",
        post_id: pid.data,
        updated_at: existingPost.updated_at.toISOString(),
        was_edited: existingPost.content_edited_at != null,
      });
    }

    if (uniqueRemovedIds.length > 0) {
      const removable = await prisma.postAttachment.findMany({
        where: {
          post_id: pid.data,
          attachment_id: { in: uniqueRemovedIds },
        },
      });
      if (removable.length !== uniqueRemovedIds.length) {
        return apiError("Adjunto que no pertenece a esta publicaci?n", 400);
      }
    }

    if (attachmentMutation) {
      const current = await prisma.postAttachment.count({
        where: { post_id: pid.data },
      });
      if (
        current - uniqueRemovedIds.length + newFiles.length >
        POST_MAX_ATTACHMENTS
      ) {
        return apiError(`M?ximo ${POST_MAX_ATTACHMENTS} archivos`, 400);
      }
    }

    if (dynamicsChange && dynamicPatch) {
      await applyDynamicPatch({ postId: pid.data, patch: dynamicPatch });
      scheduleChainWork();
    }

    if (uniqueRemovedIds.length > 0) {
      const removable = await prisma.postAttachment.findMany({
        where: {
          post_id: pid.data,
          attachment_id: { in: uniqueRemovedIds },
        },
      });
      for (const attachment of removable) {
        const fsPath = resolveSafePostAttachmentPath(attachment.url, pid.data);
        if (!fsPath) continue;
        try {
          await unlink(fsPath);
        } catch {
          /* archivo ausente en disco: no abortar el PATCH por ello */
        }
      }
      await prisma.postAttachment.deleteMany({
        where: {
          post_id: pid.data,
          attachment_id: { in: uniqueRemovedIds },
        },
      });
    }

    if (newFiles.length > 0) {
      const remaining = await prisma.postAttachment.count({
        where: { post_id: pid.data },
      });
      if (remaining + newFiles.length > POST_MAX_ATTACHMENTS) {
        return apiError(`M?ximo ${POST_MAX_ATTACHMENTS} archivos`, 400);
      }
      try {
        const savedRows: {
          url: string;
          mime_type: string;
          original_name: string | null;
        }[] = [];
        for (let i = 0; i < newFiles.length; i++) {
          savedRows.push(
            await savePostUpload(newFiles[i], pid.data, {
              index: remaining + i,
            })
          );
        }
        await prisma.postAttachment.createMany({
          data: savedRows.map((saved) => ({
            post_id: pid.data,
            url: saved.url,
            mime_type: saved.mime_type,
            original_name: saved.original_name,
          })),
        });
      } catch (e) {
        if (e instanceof PostUploadError) {
          if (e.code === "TOO_LARGE") {
            return apiError(
              `Archivo demasiado grande (m?x. ${postUploadMaxSizeLabelEs()})`,
              400
            );
          }
          return apiError(
            `Tipo no permitido: ${e.mime ?? "desconocido"}`,
            400
          );
        }
        throw e;
      }
    }

    let updatedAt = existingPost.updated_at;
    let contentEditedAt = existingPost.content_edited_at;
    if (attachmentMutation || !sameText) {
      const row = await prisma.post.update({
        where: { post_id: pid.data },
        data: {
          title,
          body,
          ...(existingPost.content_edited_at == null
            ? { content_edited_at: new Date() }
            : {}),
        },
        select: { updated_at: true, content_edited_at: true },
      });
      updatedAt = row.updated_at;
      contentEditedAt = row.content_edited_at;
    }

    return respondWithDynamics(userId, pid.data, {
      message: "Actualizado",
      post_id: pid.data,
      updated_at: updatedAt.toISOString(),
      was_edited: contentEditedAt != null,
    });
  } catch (err) {
    if (err instanceof PostDynamicRequestError) {
      return apiError(err.message, err.status);
    }
    return apiError("Error al actualizar la publicaci?n", 500);
  }
}

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ postId: string }> }
) {
  try {
    const gate = await requireActiveAdminSession();
    if (!gate.ok) return gate.response;
    const userId = gate.userId;

    const { postId } = await context.params;
    const pid = postIdParamSchema.safeParse(postId);
    if (!pid.success) {
      return apiError("Post inv?lido", 400);
    }

    const existingPost = await prisma.post.findUnique({
      where: { post_id: pid.data },
      select: { author_id: true },
    });
    if (!existingPost) {
      return apiError("Publicaci?n no encontrada", 404);
    }
    if (existingPost.author_id !== userId) {
      return apiError("Prohibido", 403);
    }

    const postDir = path.join(
      process.cwd(),
      "public",
      "uploads",
      "posts",
      pid.data
    );
    await rm(postDir, { recursive: true, force: true }).catch(() => {});

    await prisma.post.delete({
      where: { post_id: pid.data },
    });

    return apiSuccess({
      message: "Eliminado",
      post_id: pid.data,
    });
  } catch {
    return apiError("Error al eliminar la publicaci?n", 500);
  }
}
