import { fetchSessionJson } from "src/lib/api/fetchSessionJson";

import {
  type FeedPost,
  isPostsSuccess,
} from "./feedTypes";

export type FetchPostsListPageResult =
  | { ok: true; posts: FeedPost[]; nextCursor: string | null }
  | { ok: false; error: string; unauthorized?: true };

/**
 * `GET /api/posts` desde el navegador (cookies de sesión).
 */
export async function fetchPostsListPage(opts: {
  limit: number;
  cursor?: string | null;
  /** Lista solo publicaciones del autor; requiere sesión admin. */
  mine?: boolean;
  networkErrorMessage: string;
}): Promise<FetchPostsListPageResult> {
  const params = new URLSearchParams({ limit: String(opts.limit) });
  if (opts.cursor) params.set("cursor", opts.cursor);
  if (opts.mine) params.set("mine", "1");

  const result = await fetchSessionJson<{
    posts: FeedPost[];
    nextCursor: string | null;
  }>(`/api/posts?${params.toString()}`, {
    networkErrorMessage: opts.networkErrorMessage,
    parse: (body) => {
      if (!isPostsSuccess(body)) return null;
      return { posts: body.posts, nextCursor: body.nextCursor };
    },
  });

  if (!result.ok) return result;
  return {
    ok: true,
    posts: result.data.posts,
    nextCursor: result.data.nextCursor,
  };
}
