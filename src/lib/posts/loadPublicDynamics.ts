import { Prisma } from "src/generated/prisma/client";

import prisma from "src/lib/db";
import {
  evaluateAndCloseDynamic,
  isDynamicKind,
  isDynamicStatus,
  toAuthorDynamicSummary,
  toPublicDynamicSummary,
  type AuthorDynamicSummary,
  type DynamicRecord,
} from "src/lib/posts/dynamics";

const publicDynamicSelect = {
  dynamic_id: true,
  post_id: true,
  establishment_id: true,
  kind: true,
  status: true,
  config: true,
  progress_count: true,
  progress_amount: true,
  goal_count: true,
  starts_at: true,
  ends_at: true,
  closed_at: true,
  created_at: true,
} as const;

type PublicDynamicRow = {
  dynamic_id: string;
  post_id: string;
  establishment_id: string | null;
  kind: string;
  status: string;
  config: unknown;
  progress_count: number;
  progress_amount: Prisma.Decimal | number | string;
  goal_count: number | null;
  starts_at: Date | null;
  ends_at: Date | null;
  closed_at: Date | null;
  created_at: Date;
};

function toRecord(row: PublicDynamicRow): DynamicRecord | null {
  if (!isDynamicKind(row.kind) || !isDynamicStatus(row.status)) return null;
  return {
    dynamic_id: row.dynamic_id,
    post_id: row.post_id,
    establishment_id: row.establishment_id,
    kind: row.kind,
    status: row.status,
    config: row.config,
    progress_count: row.progress_count,
    progress_amount: new Prisma.Decimal(row.progress_amount),
    goal_count: row.goal_count,
    starts_at: row.starts_at,
    ends_at: row.ends_at,
    closed_at: row.closed_at,
    token: null,
  };
}

export type LoadDynamicsOptions = {
  /** Author responses only. Public feeds must leave this unset. */
  includeAuthorCode?: boolean;
};

/**
 * Summaries for a page of posts.
 * Active dynamics are closed in the database when time has run out, then summarized.
 * The QR token is never returned. The promo code is included only when
 * `includeAuthorCode` is set, and only on that author's own responses.
 */
export async function loadPublicDynamicsByPost(
  postIds: readonly string[],
  viewerUserId: string,
  now: Date = new Date(),
  options?: LoadDynamicsOptions
): Promise<Map<string, AuthorDynamicSummary[]>> {
  const ids = [...new Set(postIds)];
  const grouped = new Map<string, PublicDynamicSummary[]>();
  for (const postId of ids) grouped.set(postId, []);
  if (ids.length === 0) return grouped;

  const rows = (await prisma.postDynamic.findMany({
    where: { post_id: { in: ids } },
    orderBy: [{ created_at: "asc" }, { dynamic_id: "asc" }],
    select: publicDynamicSelect,
  })) as PublicDynamicRow[];

  const records = new Map<string, DynamicRecord>();
  for (const row of rows) {
    const record = toRecord(row);
    if (record) records.set(row.dynamic_id, record);
  }

  const activeIds = [...records.values()]
    .filter((record) => record.status === "active")
    .map((record) => record.dynamic_id);

  if (activeIds.length > 0) {
    await prisma.$transaction(async (tx) => {
      for (const dynamicId of activeIds) {
        const next = await evaluateAndCloseDynamic(tx, dynamicId, now);
        if (!next) {
          records.delete(dynamicId);
          continue;
        }
        records.set(dynamicId, { ...next, token: null });
      }
    });
  }

  const dynamicIds = [...records.keys()];
  const participated = new Set<string>();
  if (dynamicIds.length > 0) {
    const hits = await prisma.postDynamicParticipation.findMany({
      where: {
        user_id: viewerUserId,
        dynamic_id: { in: dynamicIds },
      },
      select: { dynamic_id: true },
    });
    for (const hit of hits) participated.add(hit.dynamic_id);
  }

  for (const row of rows) {
    const record = records.get(row.dynamic_id);
    const list = grouped.get(row.post_id);
    if (!record || !list) continue;
    const summaryOptions = {
      viewerParticipated: participated.has(row.dynamic_id),
      now,
    };
    list.push(
      options?.includeAuthorCode
        ? toAuthorDynamicSummary(record, summaryOptions)
        : toPublicDynamicSummary(record, summaryOptions)
    );
  }

  return grouped;
}

export async function loadPublicDynamicsForPost(
  postId: string,
  viewerUserId: string,
  now?: Date,
  options?: LoadDynamicsOptions
): Promise<AuthorDynamicSummary[]> {
  const grouped = await loadPublicDynamicsByPost(
    [postId],
    viewerUserId,
    now,
    options
  );
  return grouped.get(postId) ?? [];
}
