import prisma from "src/lib/db";
import { apiError, apiSuccess } from "src/lib/api/response";
import { requireActiveAdminSession } from "src/lib/api/requireActiveAdmin";
import { loadAirdropEligibleUsers } from "src/lib/airdrop/loadAirdropEligibleUsers";
import {
  AIRDROP_EMISOR_PUBLIC_KEY,
  AIRDROP_DEFAULT_ASSET,
} from "src/lib/airdrop/constants";

export async function GET() {
  try {
    const gate = await requireActiveAdminSession();
    if (!gate.ok) return gate.response;

    const { config, users } = await loadAirdropEligibleUsers(gate.userId);

    return apiSuccess({
      amount: config?.amount ?? 0,
      asset: config?.asset ?? AIRDROP_DEFAULT_ASSET,
      source_public_key: AIRDROP_EMISOR_PUBLIC_KEY,
      scheduled_date: config?.scheduled_date?.toISOString() ?? null,
      scheduled_end_date: config?.scheduled_end_date?.toISOString() ?? null,
      max_users: config?.max_users ?? 0,
      periodicity_months: config?.periodicity_months ?? 0,
      users,
    });
  } catch {
    return apiError("Error al cargar el airdrop", 500);
  }
}
