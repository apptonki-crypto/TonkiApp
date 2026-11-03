import { fetchSessionJson } from "src/lib/api/fetchSessionJson";
import { normalizeAirdropAssetCode } from "src/lib/airdrop/constants";

import {
  isAirdropPageSuccess,
  type AirdropPagePayload,
} from "./types";

export type FetchAdminAirdropResult =
  | { ok: true; data: AirdropPagePayload }
  | { ok: false; error: string; unauthorized?: true };

export async function fetchAdminAirdrop(opts: {
  networkErrorMessage: string;
}): Promise<FetchAdminAirdropResult> {
  return fetchSessionJson("/api/admin/airdrop", {
    networkErrorMessage: opts.networkErrorMessage,
    parse: (body) => {
      if (!isAirdropPageSuccess(body)) return null;
      const {
        amount,
        asset,
        source_public_key,
        scheduled_date,
        scheduled_end_date,
        max_users,
        periodicity_months,
        users,
      } = body;
      return {
        amount,
        asset: normalizeAirdropAssetCode(asset),
        source_public_key,
        scheduled_date,
        scheduled_end_date: scheduled_end_date ?? null,
        max_users,
        periodicity_months,
        users,
      };
    },
  });
}
