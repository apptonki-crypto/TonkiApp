import { Prisma } from "src/generated/prisma/client";

import prisma from "src/lib/db";
import {
  MAX_POST_DYNAMICS,
  isDynamicKind,
  isDynamicStatus,
  createDynamicToken,
  toPostDynamicWriteData,
  type PostDynamicCreateInput,
} from "src/lib/posts/dynamics";
import {
  DYNAMIC_KIND_LOCKED_MESSAGE,
  DYNAMIC_NOT_FOUND_MESSAGE,
  DYNAMIC_PATCH_MAX_MESSAGE,
  DYNAMIC_REMOVE_BLOCKED_MESSAGE,
  MISSING_CONSUMPTION_ESTABLISHMENT,
  PostDynamicRequestError,
  isDynamicClaimToken,
  isUnresolvedEstablishment,
  planDynamicPatch,
  type ExistingDynamic,
  type ParsedDynamicsPatch,
} from "src/lib/posts/dynamicRequests";

const existingDynamicSelect = {
  dynamic_id: true,
  kind: true,
  status: true,
  establishment_id: true,
  token: true,
  _count: { select: { participations: true } },
} as const;

type ExistingRow = {
  dynamic_id: string;
  kind: string;
  status: string;
  establishment_id: string | null;
  token: string | null;
  _count: { participations: number };
};

export function mapExistingDynamics(rows: readonly ExistingRow[]): ExistingDynamic[] {
  const mapped: ExistingDynamic[] = [];
  for (const row of rows) {
    if (!isDynamicKind(row.kind) || !isDynamicStatus(row.status)) continue;
    mapped.push({
      dynamic_id: row.dynamic_id,
      kind: row.kind,
      status: row.status,
      participation_count: row._count.participations,
      establishment_id: row.establishment_id,
      token: row.token,
    });
  }
  return mapped;
}

export async function listExistingDynamics(
  postId: string
): Promise<ExistingDynamic[]> {
  const rows = await prisma.postDynamic.findMany({
    where: { post_id: postId },
    select: existingDynamicSelect,
  });
  return mapExistingDynamics(rows);
}

function assertWritableEstablishment(input: PostDynamicCreateInput): void {
  if (
    input.kind === "consumption" &&
    isUnresolvedEstablishment(input.establishment_id)
  ) {
    throw new PostDynamicRequestError(400, MISSING_CONSUMPTION_ESTABLISHMENT);
  }
}

export async function createPostDynamics(
  tx: Prisma.TransactionClient,
  postId: string,
  inputs: readonly PostDynamicCreateInput[],
  now: Date = new Date()
): Promise<void> {
  for (let index = 0; index < inputs.length; index += 1) {
    const input = inputs[index];
    assertWritableEstablishment(input);
    const token = input.kind === "qr" ? createDynamicToken() : undefined;
    const data = toPostDynamicWriteData(input, token ? { token } : undefined);
    await tx.postDynamic.create({
      data: {
        post_id: postId,
        ...data,
        created_at: new Date(now.getTime() + index),
      },
    });
  }
}

async function lockDynamic(
  tx: Prisma.TransactionClient,
  postId: string,
  dynamicId: string
): Promise<boolean> {
  const rows = await tx.$queryRaw<Array<{ dynamic_id: string }>>`
    SELECT \`dynamic_id\`
    FROM \`PostDynamic\`
    WHERE \`dynamic_id\` = ${dynamicId} AND \`post_id\` = ${postId}
    FOR UPDATE
  `;
  return rows.length > 0;
}

async function participationCount(
  tx: Prisma.TransactionClient,
  dynamicId: string
): Promise<number> {
  return tx.postDynamicParticipation.count({
    where: { dynamic_id: dynamicId },
  });
}

export async function applyDynamicPatch(input: {
  postId: string;
  patch: ParsedDynamicsPatch;
  now?: Date;
}): Promise<void> {
  const now = input.now ?? new Date();
  await prisma.$transaction(async (tx) => {
    const rows = await tx.postDynamic.findMany({
      where: { post_id: input.postId },
      select: existingDynamicSelect,
    });
    const planned = planDynamicPatch(mapExistingDynamics(rows), input.patch);
    if (!planned.ok) {
      throw new PostDynamicRequestError(planned.status, planned.error);
    }

    const creates = planned.ops.filter((op) => op.type === "create");
    let createsChecked = false;

    for (const op of planned.ops) {
      if (op.type === "remove") {
        const locked = await lockDynamic(tx, input.postId, op.dynamic_id);
        if (!locked) {
          throw new PostDynamicRequestError(400, DYNAMIC_NOT_FOUND_MESSAGE);
        }
        const count = await participationCount(tx, op.dynamic_id);
        if (count > 0) {
          throw new PostDynamicRequestError(409, DYNAMIC_REMOVE_BLOCKED_MESSAGE);
        }
        await tx.postDynamic.delete({ where: { dynamic_id: op.dynamic_id } });
        continue;
      }

      if (op.type === "replace") {
        const locked = await lockDynamic(tx, input.postId, op.dynamic_id);
        if (!locked) {
          throw new PostDynamicRequestError(400, DYNAMIC_NOT_FOUND_MESSAGE);
        }
        const row = await tx.postDynamic.findUnique({
          where: { dynamic_id: op.dynamic_id },
          select: { kind: true, status: true, token: true },
        });
        if (!row || !isDynamicKind(row.kind) || !isDynamicStatus(row.status)) {
          throw new PostDynamicRequestError(400, DYNAMIC_NOT_FOUND_MESSAGE);
        }
        if (row.kind !== op.input.kind) {
          throw new PostDynamicRequestError(409, DYNAMIC_KIND_LOCKED_MESSAGE);
        }
        const count = await participationCount(tx, op.dynamic_id);
        if (row.status !== "active" || count > 0) continue;

        assertWritableEstablishment(op.input);
        const token =
          op.input.kind === "qr"
            ? row.token && isDynamicClaimToken(row.token)
              ? row.token
              : createDynamicToken()
            : undefined;
        const data = toPostDynamicWriteData(
          op.input,
          token ? { token } : undefined
        );
        await tx.postDynamic.update({
          where: { dynamic_id: op.dynamic_id },
          data: {
            status: data.status,
            config: data.config,
            progress_count: data.progress_count,
            progress_amount: data.progress_amount,
            goal_count: data.goal_count,
            starts_at: data.starts_at,
            ends_at: data.ends_at,
            establishment_id: data.establishment_id,
            token: data.token,
            closed_at: null,
          },
        });
        continue;
      }

      if (op.type === "create") {
        if (!createsChecked) {
          createsChecked = true;
          const total = await tx.postDynamic.count({
            where: { post_id: input.postId },
          });
          if (total + creates.length > MAX_POST_DYNAMICS) {
            throw new PostDynamicRequestError(400, DYNAMIC_PATCH_MAX_MESSAGE);
          }
        }
        assertWritableEstablishment(op.input);
        const createdAt = new Date(now.getTime() + creates.indexOf(op));
        const token = op.input.kind === "qr" ? createDynamicToken() : undefined;
        const data = toPostDynamicWriteData(
          op.input,
          token ? { token } : undefined
        );
        await tx.postDynamic.create({
          data: {
            post_id: input.postId,
            ...data,
            created_at: createdAt,
          },
        });
        continue;
      }

      if (op.type === "close") {
        const locked = await lockDynamic(tx, input.postId, op.dynamic_id);
        if (!locked) continue;
        await tx.postDynamic.updateMany({
          where: {
            dynamic_id: op.dynamic_id,
            post_id: input.postId,
            status: "active",
          },
          data: { status: "exhausted", closed_at: now },
        });
      }
    }
  });
}
