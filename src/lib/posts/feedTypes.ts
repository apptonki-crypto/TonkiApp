import type {
  DynamicKind,
  DynamicPhase,
  DynamicStatus,
} from "src/lib/posts/dynamics/constants";

export type FeedPostAuthor = {
  user_id: string;
  name: string;
  avatar_url: string | null;
};

export type FeedPostAttachment = {
  attachment_id: string;
  url: string;
  mime_type: string;
  original_name?: string | null;
};

/**
 * Resumen de una dinámica en el feed.
 * Los campos de autor (`code`, `participation_count`) solo vienen en respuestas del autor.
 * `viewerParticipated` se acepta además de `viewer_participated`.
 */
export type FeedPostDynamic = {
  dynamic_id: string;
  post_id?: string | null;
  kind: DynamicKind;
  status?: DynamicStatus | null;
  phase?: DynamicPhase | null;
  text?: string | null;
  progress_count?: number | null;
  progress_amount?: string | number | null;
  goal_count?: number | null;
  goal_amount?: string | null;
  goal_mode?: "count" | "amount" | null;
  starts_at?: string | null;
  ends_at?: string | null;
  closed_at?: string | null;
  min_ticket?: string | null;
  product_ids?: string[] | null;
  viewer_participated?: boolean;
  viewerParticipated?: boolean;
  code?: string | null;
  promo_code?: string | null;
  participation_count?: number | null;
  participationCount?: number | null;
  establishment_id?: string | null;
};

export type FeedPost = {
  post_id: string;
  title: string;
  body: string | null;
  view_count: number;
  share_count: number;
  created_at: string;
  /** Última modificación (igual a `created_at` hasta la primera edición). */
  updated_at: string;
  /** `true` si el post se editó después de publicarse. */
  was_edited: boolean;
  author: FeedPostAuthor;
  attachments: FeedPostAttachment[];
  /** Ausente en respuestas anteriores a las dinámicas. */
  dynamics?: FeedPostDynamic[];
};

type PostsListSuccessBody = {
  success: true;
  posts: FeedPost[];
  nextCursor: string | null;
};

/** Respuesta JSON de `GET /api/posts` con `success: true` y forma esperada. */
export function isPostsSuccess(data: unknown): data is PostsListSuccessBody {
  if (typeof data !== "object" || data === null) return false;
  const o = data as Record<string, unknown>;
  if (o.success !== true) return false;
  if (!Array.isArray(o.posts)) return false;
  if (!("nextCursor" in o)) return false;
  const nc = o.nextCursor;
  if (nc !== null && typeof nc !== "string") return false;
  return true;
}
