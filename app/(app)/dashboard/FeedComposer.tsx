"use client";

import { useCallback, useEffect, useState } from "react";

import { readJsonSafely } from "src/lib/api/readJsonSafely";
import type { UserRole } from "src/types/auth";

import { PostComposerForm } from "./PostComposerForm";

type FeedComposerProps = {
  onPublished: () => void;
};

export function FeedComposer({ onPublished }: FeedComposerProps) {
  const [role, setRole] = useState<UserRole | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/auth/me", { credentials: "include" });
        const data = await readJsonSafely<{
          success?: boolean;
          role?: UserRole;
        }>(res);
        if (cancelled) return;
        if (res.ok && data?.success === true && data.role) {
          setRole(data.role);
        } else {
          setRole(null);
        }
      } catch {
        if (!cancelled) setRole(null);
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handlePublished = useCallback(() => {
    onPublished();
  }, [onPublished]);

  if (!ready || role !== "admin") {
    return null;
  }

  return (
    <div className="rounded-3xl border border-tonki-border bg-white px-4 py-4 shadow-[0_10px_30px_-22px_rgba(45,33,13,0.45)] sm:px-5">
      <PostComposerForm
        className="flex flex-col gap-4"
        onPublished={handlePublished}
      />
    </div>
  );
}
