import { fetchSessionJson } from "src/lib/api/fetchSessionJson";

import type { AirdropStatsPayload } from "./types";

export type FetchAirdropStatsResult =
  | { ok: true; data: AirdropStatsPayload }
  | { ok: false; error: string; unauthorized?: true };

function isStatsSuccess(
  data: unknown
): data is AirdropStatsPayload & { success: true } {
  if (typeof data !== "object" || data === null) return false;
  const o = data as Record<string, unknown>;
  return o.success === true && Array.isArray(o.archives);
}

export async function fetchAirdropStats(opts: {
  networkErrorMessage: string;
}): Promise<FetchAirdropStatsResult> {
  return fetchSessionJson("/api/admin/airdrop/stats", {
    networkErrorMessage: opts.networkErrorMessage,
    parse: (body) => {
      if (!isStatsSuccess(body)) return null;
      return { archives: body.archives };
    },
  });
}
