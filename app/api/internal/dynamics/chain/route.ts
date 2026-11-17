import { handleChainCron } from "src/lib/posts/chain/cron";

export const dynamic = "force-dynamic";
/** Each job waits for a Stellar confirmation. */
export const maxDuration = 300;

// Vercel Cron sends GET with `Authorization: Bearer $CRON_SECRET`.
export async function GET(request: Request) {
  return handleChainCron(request);
}

export async function POST(request: Request) {
  return handleChainCron(request);
}
