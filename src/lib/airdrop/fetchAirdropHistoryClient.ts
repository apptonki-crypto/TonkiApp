import { fetchSessionJson } from "src/lib/api/fetchSessionJson";
import type {
  AirdropHistoryLogRecord,
  AirdropHistoryPayload,
} from "src/lib/airdrop/types";

export type FetchAirdropHistoryResult =
  | { ok: true; data: AirdropHistoryPayload }
  | { ok: false; error: string; unauthorized?: true };

function isHistoryPayload(data: unknown): data is AirdropHistoryPayload & {
  success: true;
} {
  if (typeof data !== "object" || data === null) return false;
  const o = data as Record<string, unknown>;
  return o.success === true && Array.isArray(o.logs);
}

export async function fetchAirdropHistory(opts: {
  networkErrorMessage: string;
}): Promise<FetchAirdropHistoryResult> {
  return fetchSessionJson("/api/admin/airdrop/history", {
    networkErrorMessage: opts.networkErrorMessage,
    parse: (body) => {
      if (!isHistoryPayload(body)) return null;
      return { logs: body.logs as AirdropHistoryLogRecord[] };
    },
  });
}
