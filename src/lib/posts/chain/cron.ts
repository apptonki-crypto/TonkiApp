import { timingSafeEqual } from "node:crypto";

import { requeueFailedJobs } from "src/lib/posts/chain/jobs";
import { runChainWorker } from "src/lib/posts/chain/worker";

const MIN_SECRET_LENGTH = 24;

function secretMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function flag(value: string | null): boolean {
  return value === "1" || value === "true";
}

/**
 * Entry point for the scheduler (Vercel Cron, system cron, GitHub Actions…). It signs
 * Stellar transactions with the company key, so it only answers to `CRON_SECRET`; if
 * the secret is missing the endpoint is closed instead of open.
 *
 * Query: `reconcile=1` compares contracts with the database, `retryFailed=1` puts failed
 * jobs back in the queue, `limit=N` caps the jobs processed in this tick.
 */
export async function handleChainCron(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET?.trim() ?? "";
  if (secret.length < MIN_SECRET_LENGTH) {
    return Response.json({ error: "Cron no configurado." }, { status: 503 });
  }

  const header = request.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!provided || !secretMatches(provided, secret)) {
    return Response.json({ error: "No autorizado." }, { status: 401 });
  }

  const url = new URL(request.url);
  const limitParam = Number(url.searchParams.get("limit"));
  const limit =
    Number.isInteger(limitParam) && limitParam > 0 ? Math.min(limitParam, 50) : undefined;

  try {
    const requeued = flag(url.searchParams.get("retryFailed"))
      ? await requeueFailedJobs()
      : 0;
    const report = await runChainWorker({
      limit,
      reconcile: flag(url.searchParams.get("reconcile")),
    });
    return Response.json({ ok: true, requeued, ...report });
  } catch (error) {
    console.error("[dynamics-chain] cron failed", error);
    return Response.json({ error: "Falló la ejecución del worker." }, { status: 500 });
  }
}
