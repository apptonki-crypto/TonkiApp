"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  type MouseEvent,
  useRef,
  useState,
} from "react";

import { readJsonSafely } from "src/lib/api/readJsonSafely";
import {
  filterImageAttachments,
  filterVideoAttachments,
  isPostAttachmentImageMime,
  isPostAttachmentVideoMime,
} from "src/lib/posts/attachmentMime";
import type { FeedPost, FeedPostAttachment } from "src/lib/posts/feedTypes";
import { fetchPostsListPage } from "src/lib/posts/fetchPostsListClient";

import { FallbackImage } from "src/components/FallbackImage";
import {
  UserProfileModal,
  type ProfilePreview,
} from "src/components/UserProfileModal";

import { PostDynamicsPanel } from "src/components/posts/PostDynamicsPanel";
import type { NormalizedDynamic } from "src/lib/posts/dynamicClient";
import { ImageAttachmentGrid } from "./ImageAttachmentGrid";
import { FeedComposer } from "./FeedComposer";
import { PostOverlayModal } from "./PostOverlayModal";
import { PostShareButton } from "./PostShareButton";

const PAGE_SIZE = 20;

function nonImageNonVideoAttachments(attachments: FeedPostAttachment[]) {
  return attachments.filter(
    (a) =>
      !isPostAttachmentImageMime(a.mime_type) &&
      !isPostAttachmentVideoMime(a.mime_type)
  );
}

function bodySnippet(body: string | null, maxLen = 200): string | null {
  if (!body?.trim()) return null;
  const t = body.trim();
  if (t.length <= maxLen) return t;
  return `${t.slice(0, maxLen).trim()}…`;
}

const compactNumber = new Intl.NumberFormat("es", {
  notation: "compact",
  maximumFractionDigits: 1,
});

const RELATIVE_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["day", 86400],
  ["hour", 3600],
  ["minute", 60],
];

function relativeTimeLabel(iso: string): string {
  const date = new Date(iso);
  const diffSec = (date.getTime() - Date.now()) / 1000;
  if (Math.abs(diffSec) < 60) return "ahora";
  if (Math.abs(diffSec) >= 7 * 86400) {
    return date.toLocaleDateString("es", { day: "numeric", month: "short" });
  }
  const rtf = new Intl.RelativeTimeFormat("es", { numeric: "auto", style: "short" });
  for (const [unit, seconds] of RELATIVE_UNITS) {
    if (Math.abs(diffSec) >= seconds) {
      return rtf.format(Math.round(diffSec / seconds), unit);
    }
  }
  return "ahora";
}

function AuthorAvatar({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  return (
    <span className="tonki-hex-cell flex h-12 w-11 items-center justify-center bg-gradient-to-br from-tonki-accent to-tonki-cta p-[2px] transition-transform group-hover/author:scale-105">
      <span className="tonki-hex-cell flex h-full w-full items-center justify-center overflow-hidden bg-tonki-canvas">
        {avatarUrl ? (
          <FallbackImage src={avatarUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="text-sm font-bold text-tonki-text-muted">
            {name.trim().charAt(0).toUpperCase() || "?"}
          </span>
        )}
      </span>
    </span>
  );
}

function FeedSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-hidden>
      {[0, 1].map((i) => (
        <div
          key={i}
          className="animate-pulse rounded-3xl border border-tonki-border bg-white p-5"
        >
          <div className="flex items-center gap-3">
            <div className="tonki-hex-cell h-12 w-11 bg-tonki-surface-hover" />
            <div className="flex flex-col gap-2">
              <div className="h-3 w-28 rounded-full bg-tonki-surface-hover" />
              <div className="h-2.5 w-16 rounded-full bg-tonki-surface-hover/70" />
            </div>
          </div>
          <div className="mt-5 h-4 w-3/4 rounded-full bg-tonki-surface-hover" />
          <div className="mt-3 h-3 w-full rounded-full bg-tonki-surface-hover/70" />
          <div className="mt-2 h-3 w-5/6 rounded-full bg-tonki-surface-hover/70" />
        </div>
      ))}
    </div>
  );
}

function PostViewCount({
  postId,
  initial,
}: {
  postId: string;
  initial: number;
}) {
  const [count, setCount] = useState(initial);
  const ref = useRef<HTMLSpanElement | null>(null);
  const sentRef = useRef(false);
  useEffect(() => {
    const key = `tonki_view:${postId}`;
    const root = ref.current?.closest("article");
    const el = root ?? ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const hit = entries.some(
          (entry) =>
            entry.isIntersecting &&
            typeof entry.intersectionRatio === "number" &&
            entry.intersectionRatio >= 0.28
        );
        if (!hit) return;

        if (typeof sessionStorage !== "undefined" && sessionStorage.getItem(key)) {
          sentRef.current = true;
          return;
        }
        if (sentRef.current) return;
        sentRef.current = true;

        void (async () => {
          try {
            const res = await fetch(`/api/posts/${postId}/view`, {
              method: "POST",
              credentials: "include",
            });
            const data = await readJsonSafely<Record<string, unknown>>(res);
            if (
              res.ok &&
              data?.success === true &&
              typeof data.view_count === "number"
            ) {
              setCount(data.view_count);
              sessionStorage.setItem(key, "1");
            } else {
              sentRef.current = false;
            }
          } catch {
            sentRef.current = false;
          }
        })();
      },
      { threshold: [0, 0.28, 0.45] }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [postId]);

  return (
    <span
      ref={ref}
      className="inline-flex items-center gap-1.5 text-sm font-medium tabular-nums text-tonki-text-muted"
      title={`${count} vistas`}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.75}
        stroke="currentColor"
        className="h-[18px] w-[18px]"
        aria-hidden
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z"
        />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
        />
      </svg>
      {compactNumber.format(count)}
      <span className="sr-only">vistas</span>
    </span>
  );
}

export function PostFeed() {
  const [feedItems, setFeedItems] = useState<FeedPost[]>([]);
  const [activePost, setActivePost] = useState<FeedPost | null>(null);
  const [profilePreview, setProfilePreview] = useState<ProfilePreview | null>(
    null
  );
  const [apiNextCursor, setApiNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unauthorized, setUnauthorized] = useState(false);
  const loadingRef = useRef(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const fetchPage = useCallback(async (cursor: string | null, append: boolean) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    setError(null);
    setUnauthorized(false);

    const result = await fetchPostsListPage({
      limit: PAGE_SIZE,
      cursor: cursor ?? undefined,
      networkErrorMessage: "No se pudo cargar el feed",
    });

    if (!result.ok) {
      if (result.unauthorized) setUnauthorized(true);
      else setError(result.error);
      loadingRef.current = false;
      setLoading(false);
      return;
    }

    if (append) {
      setFeedItems((prev) => {
        const seen = new Set(prev.map((p) => p.post_id));
        return [...prev, ...result.posts.filter((p) => !seen.has(p.post_id))];
      });
    } else {
      setFeedItems(result.posts);
    }
    setApiNextCursor(result.nextCursor);
    loadingRef.current = false;
    setLoading(false);
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void fetchPage(null, false);
    });
  }, [fetchPage]);

  const loadMore = useCallback(() => {
    if (loadingRef.current || apiNextCursor === null) return;
    void fetchPage(apiNextCursor, true);
  }, [apiNextCursor, fetchPage]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry?.isIntersecting && !loadingRef.current) {
          loadMore();
        }
      },
      { root: null, rootMargin: "240px", threshold: 0 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMore]);

  const setPostQuery = useCallback(
    (postId: string | null) => {
      const next = new URLSearchParams(searchParams.toString());
      if (postId) next.set("post", postId);
      else next.delete("post");
      const query = next.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  const openPost = useCallback(
    (post: FeedPost) => {
      setActivePost(post);
      setPostQuery(post.post_id);
    },
    [setPostQuery]
  );

  const closePost = useCallback(() => {
    setActivePost(null);
    setPostQuery(null);
  }, [setPostQuery]);

  const updatePostDynamics = useCallback(
    (postId: string, dynamics: NormalizedDynamic[]) => {
      setActivePost((current) =>
        current?.post_id === postId ? { ...current, dynamics } : current
      );
      setFeedItems((prev) =>
        prev.map((item) =>
          item.post_id === postId ? { ...item, dynamics } : item
        )
      );
    },
    []
  );

  useEffect(() => {
    const requestedPostId = searchParams.get("post");
    if (!requestedPostId) {
      queueMicrotask(() => {
        setActivePost(null);
      });
      return;
    }
    if (activePost?.post_id === requestedPostId) return;

    const existing = feedItems.find((p) => p.post_id === requestedPostId);
    if (existing) {
      queueMicrotask(() => {
        setActivePost(existing);
      });
      return;
    }

    const controller = new AbortController();
    void (async () => {
      try {
        const res = await fetch(`/api/posts/${requestedPostId}`, {
          credentials: "include",
          signal: controller.signal,
        });
        const data = await readJsonSafely<{ success?: boolean; post?: FeedPost }>(res);
        if (res.ok && data?.success === true && data.post) {
          setActivePost(data.post);
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        // No-op: keep feed usable if deep-link fetch fails.
      }
    })();
    return () => controller.abort();
  }, [activePost?.post_id, feedItems, searchParams]);

  if (unauthorized) {
    return (
      <div className="rounded-2xl border border-tonki-border bg-tonki-surface p-8 text-center">
        <p className="text-base text-tonki-text-secondary">
          Necesitas iniciar sesión para ver el feed.
        </p>
        <Link
          href="/login"
          className="mt-4 inline-block text-sm font-semibold text-tonki-accent underline-offset-4 hover:underline"
        >
          Ir a iniciar sesión
        </Link>
      </div>
    );
  }

  if (error && feedItems.length === 0) {
    return (
      <div className="rounded-2xl border border-tonki-border bg-tonki-surface p-8 text-center">
        <p className="text-base text-tonki-danger">{error}</p>
        <button
          type="button"
          onClick={() => void fetchPage(null, false)}
          className="mt-4 rounded-xl border border-tonki-accent px-5 py-2.5 text-sm font-semibold text-tonki-accent transition-colors hover:bg-tonki-accent hover:text-tonki-accent-fg"
        >
          Reintentar
        </button>
      </div>
    );
  }

  const canOpenModalFromTarget = (target: EventTarget | null) => {
    if (!(target instanceof HTMLElement)) return true;
    if (target.closest("a, button, input, textarea, select, video")) return false;
    return true;
  };

  const onPostClick = (event: MouseEvent<HTMLElement>, post: FeedPost) => {
    if (!canOpenModalFromTarget(event.target)) return;
    openPost(post);
  };

  return (
    <div className="flex flex-col gap-4">
      <header className="relative overflow-hidden rounded-3xl border border-tonki-border bg-gradient-to-br from-tonki-surface-hover/70 via-tonki-canvas to-tonki-canvas px-5 py-5 sm:px-6">
        <div
          aria-hidden
          className="tonki-hex-light tonki-mask-fade pointer-events-none absolute inset-y-0 right-0 w-2/3"
        />
        <div className="relative flex items-center gap-3">
          <span
            aria-hidden
            className="tonki-hex-cell h-9 w-8 shrink-0 bg-tonki-accent shadow-sm"
          />
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-tonki-text">Inicio</h2>
            <p className="text-sm text-tonki-text-muted">
              Lo nuevo de tus negocios locales
            </p>
          </div>
        </div>
      </header>
      <FeedComposer
        onPublished={() => {
          void fetchPage(null, false);
        }}
      />
      {feedItems.length === 0 && loading ? <FeedSkeleton /> : null}
      {feedItems.length === 0 && !loading && !error ? (
        <p className="rounded-3xl border border-tonki-border bg-white p-8 text-center text-sm text-tonki-text-muted">
          Todavía no hay publicaciones.
        </p>
      ) : null}
      {feedItems.map((post, index) => {
        const imgs = filterImageAttachments(post.attachments);
        const vids = filterVideoAttachments(post.attachments);
        const files = nonImageNonVideoAttachments(post.attachments);
        const snippet = bodySnippet(post.body);
        const dateLabel = new Date(post.updated_at).toLocaleString("es", {
          dateStyle: "medium",
          timeStyle: "short",
        });

        return (
          <article
            key={post.post_id}
            style={{ animationDelay: `${Math.min(index % PAGE_SIZE, 6) * 60}ms` }}
            className="tonki-feed-in group relative cursor-pointer overflow-hidden rounded-3xl border border-tonki-border bg-white p-5 shadow-[0_10px_30px_-22px_rgba(45,33,13,0.45)] outline-none transition duration-200 hover:-translate-y-0.5 hover:border-tonki-border-strong hover:shadow-[0_18px_40px_-24px_rgba(45,33,13,0.55)] focus-visible:ring-2 focus-visible:ring-tonki-accent sm:p-6"
            onClick={(event) => onPostClick(event, post)}
            onKeyDown={(event) => {
              if (!canOpenModalFromTarget(event.target)) return;
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                openPost(post);
              }
            }}
            role="button"
            tabIndex={0}
            aria-label={`Abrir publicación: ${post.title}`}
          >
            <span
              aria-hidden
              className="pointer-events-none absolute inset-y-6 left-0 w-1 rounded-r-full bg-tonki-accent opacity-0 transition-opacity duration-200 group-hover:opacity-100"
            />
            <div className="flex items-center gap-3">
              <button
                type="button"
                aria-label={`Ver perfil de ${post.author.name}`}
                onClick={() =>
                  setProfilePreview({
                    userId: post.author.user_id,
                    name: post.author.name,
                    avatarUrl: post.author.avatar_url,
                  })
                }
                className="group/author flex min-w-0 items-center gap-3 rounded-2xl text-left outline-none focus-visible:ring-2 focus-visible:ring-tonki-accent"
              >
                <AuthorAvatar name={post.author.name} avatarUrl={post.author.avatar_url} />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-[15px] font-bold text-tonki-text decoration-tonki-accent decoration-2 underline-offset-4 group-hover/author:underline">
                    {post.author.name}
                  </span>
                  <time
                    className="text-xs text-tonki-text-muted"
                    dateTime={post.updated_at}
                    title={
                      post.was_edited
                        ? `Editado: ${dateLabel} · Publicado: ${new Date(post.created_at).toLocaleString("es", { dateStyle: "medium", timeStyle: "short" })}`
                        : dateLabel
                    }
                  >
                    {relativeTimeLabel(post.updated_at)}
                  </time>
                </span>
              </button>
              {post.was_edited ? (
                <span className="ml-auto shrink-0 rounded-full bg-tonki-surface-hover px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-tonki-text-muted">
                  Editado
                </span>
              ) : null}
            </div>
            <div className="mt-4 flex min-w-0 flex-col gap-2">
              <h2 className="text-lg font-bold leading-snug tracking-tight text-tonki-text sm:text-xl">
                {post.title}
              </h2>
              {snippet && (
                <p className="text-[15px] leading-relaxed text-tonki-text-secondary whitespace-pre-wrap">
                  {snippet}
                </p>
              )}
              <PostDynamicsPanel
                postId={post.post_id}
                dynamics={post.dynamics}
                variant="compact"
              />
              {imgs.length > 0 && (
                <div className="mt-2">
                  <ImageAttachmentGrid
                    className={
                      imgs.length === 1
                        ? "m-0 grid w-full list-none grid-cols-1 gap-2 p-0 [&_button]:aspect-[16/10]"
                        : "m-0 grid w-full list-none grid-cols-2 gap-2 p-0"
                    }
                    items={imgs.map((a) => ({
                      key: a.attachment_id,
                      src: a.url,
                      alt: a.original_name?.trim() ?? "",
                    }))}
                  />
                </div>
              )}
              {vids.length > 0 && (
                <ul className="mt-2 flex flex-col gap-3">
                  {vids.map((v) => (
                    <li key={v.attachment_id} className="overflow-hidden rounded-2xl bg-tonki-media-bg ring-1 ring-tonki-border">
                      <video
                        className="max-h-[min(70vh,480px)] w-full object-contain"
                        controls
                        playsInline
                        preload="metadata"
                        src={v.url}
                        aria-label={
                          v.original_name?.trim()
                            ? `Vídeo: ${v.original_name.trim()}`
                            : "Vídeo de la publicación"
                        }
                      />
                    </li>
                  ))}
                </ul>
              )}
              {files.length > 0 && (
                <ul className="mt-2 flex flex-wrap gap-2">
                  {files.map((f) => (
                    <li key={f.attachment_id} className="min-w-0 max-w-full">
                      <a
                        href={f.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex max-w-full items-center gap-2 rounded-full border border-tonki-border bg-tonki-canvas px-3 py-1.5 text-sm font-medium text-tonki-text-secondary transition-colors hover:border-tonki-accent hover:bg-tonki-accent/15"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                          strokeWidth={1.75}
                          stroke="currentColor"
                          className="h-4 w-4 shrink-0 text-tonki-cta"
                          aria-hidden
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="m18.375 12.739-7.693 7.693a4.5 4.5 0 0 1-6.364-6.364l10.94-10.94A3 3 0 1 1 19.5 7.372L8.552 18.32m.009-.01-.01.01m5.699-9.941-7.81 7.81a1.5 1.5 0 0 0 2.112 2.13"
                          />
                        </svg>
                        <span className="truncate">{f.original_name?.trim() || f.url}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-dashed border-tonki-border pt-3">
              <PostShareButton
                postId={post.post_id}
                title={post.title}
                initialShareCount={post.share_count ?? 0}
              />
              <PostViewCount
                key={`${post.post_id}:${post.view_count ?? 0}`}
                postId={post.post_id}
                initial={post.view_count ?? 0}
              />
            </div>
          </article>
        );
      })}

      {error && feedItems.length > 0 && (
        <p className="py-4 text-center text-sm text-tonki-danger">{error}</p>
      )}

      <div ref={sentinelRef} className="h-4 w-full shrink-0" aria-hidden />

      {loading && feedItems.length > 0 && (
        <div
          className="flex items-center justify-center gap-1.5 py-3"
          role="status"
          aria-label="Cargando más publicaciones"
        >
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="tonki-hex-cell h-3 w-2.5 animate-bounce bg-tonki-accent"
              style={{ animationDelay: `${i * 120}ms` }}
            />
          ))}
        </div>
      )}
      <PostOverlayModal
        post={activePost}
        onClose={closePost}
        onDynamicsChange={updatePostDynamics}
        onOpenAuthor={(post) =>
          setProfilePreview({
            userId: post.author.user_id,
            name: post.author.name,
            avatarUrl: post.author.avatar_url,
          })
        }
      />
      <UserProfileModal
        preview={profilePreview}
        onClose={() => setProfilePreview(null)}
      />
    </div>
  );
}
