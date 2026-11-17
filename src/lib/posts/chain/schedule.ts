import { after } from "next/server";

import { readChainMode } from "src/lib/posts/chain/config";
import { processChainJobs } from "src/lib/posts/chain/worker";

/**
 * Runs a small batch right after the response so authors and customers do not wait for
 * Stellar. The cron endpoint stays the source of retries; this only shortens the delay.
 */
export function scheduleChainWork(limit = 5): void {
  if (readChainMode() === "off") return;
  try {
    after(async () => {
      try {
        await processChainJobs({ limit });
      } catch (error) {
        console.error("[dynamics-chain] scheduled run failed", error);
      }
    });
  } catch {
    // Called outside a request scope (scripts, tests): the cron endpoint picks it up.
  }
}
