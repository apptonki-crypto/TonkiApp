import { fetchSessionJson } from "src/lib/api/fetchSessionJson";

import type { AirdropConfigFormValues } from "./schemas";
import type { AirdropConfigPayload } from "./types";

export type FetchAirdropConfigResult =
  | { ok: true; data: AirdropConfigPayload }
  | { ok: false; error: string; unauthorized?: true };

export type SaveAirdropConfigResult =
  | { ok: true; config: NonNullable<AirdropConfigPayload["config"]> }
  | { ok: false; error: string; unauthorized?: true };

function isConfigGetSuccess(
  data: unknown
): data is AirdropConfigPayload & { success: true } {
  if (typeof data !== "object" || data === null) return false;
  const o = data as Record<string, unknown>;
  if (o.success !== true) return false;
  if (!("config" in o)) return false;
  if (o.config === null) return true;
  if (typeof o.config !== "object" || o.config === null) return false;
  const c = o.config as Record<string, unknown>;
  return (
    typeof c.amount === "number" &&
    (c.asset === "TONKI" || c.asset === "XLM" || c.asset === "USDC") &&
    typeof c.scheduled_date === "string" &&
    (c.scheduled_end_date === null ||
      typeof c.scheduled_end_date === "string") &&
    typeof c.periodicity_months === "number" &&
    typeof c.max_users === "number"
  );
}

export async function fetchAirdropConfig(opts: {
  networkErrorMessage: string;
}): Promise<FetchAirdropConfigResult> {
  return fetchSessionJson("/api/admin/airdrop/config", {
    networkErrorMessage: opts.networkErrorMessage,
    parse: (body) => {
      if (!isConfigGetSuccess(body)) return null;
      return { config: body.config };
    },
  });
}

export async function saveAirdropConfig(
  values: AirdropConfigFormValues
): Promise<SaveAirdropConfigResult> {
  const result = await fetchSessionJson<
    NonNullable<AirdropConfigPayload["config"]>
  >("/api/admin/airdrop/config", {
    networkErrorMessage: "No se pudo guardar la configuración",
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(values),
    parse: (body) => {
      if (typeof body !== "object" || body === null) return null;
      if ((body as { success?: boolean }).success !== true) return null;
      const config = (body as { config?: unknown }).config;
      if (
        typeof config !== "object" ||
        config === null ||
        typeof (config as { amount?: unknown }).amount !== "number"
      ) {
        return null;
      }
      return config as NonNullable<AirdropConfigPayload["config"]>;
    },
  });

  if (!result.ok) return result;
  return { ok: true, config: result.data };
}
