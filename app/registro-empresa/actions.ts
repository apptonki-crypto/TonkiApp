"use server";

import { randomUUID } from "crypto";

import { registerBusinessAccount } from "src/lib/business/registerBusiness";
import {
  logBusinessRegisterError,
  logBusinessRegisterRejection,
  resolveBusinessRegisterInfrastructureError,
} from "src/lib/business/registerBusinessLogger";
import type { BusinessRegisterResponse } from "src/types/business";

const ROUTE_LABEL = "[registro-empresa]";

export type BusinessRegisterActionResult =
  | { ok: true; data: BusinessRegisterResponse }
  | { ok: false; error: string };

export async function submitBusinessRegister(
  raw: unknown
): Promise<BusinessRegisterActionResult> {
  const requestId = randomUUID();

  try {
    const result = await registerBusinessAccount(raw);
    if (!result.ok) {
      logBusinessRegisterRejection(ROUTE_LABEL, {
        requestId,
        stage: result.status === 409 ? "user_lookup" : "validation",
        reason: `${result.status} ${result.error}`,
      });
      return { ok: false, error: result.error };
    }

    console.info(ROUTE_LABEL, {
      requestId,
      establishmentId: result.data.establishment.id,
      status: 201,
    });
    return { ok: true, data: result.data };
  } catch (err) {
    logBusinessRegisterError(ROUTE_LABEL, err, { requestId });

    const infraMessage = resolveBusinessRegisterInfrastructureError(err);
    if (infraMessage) {
      return { ok: false, error: infraMessage };
    }

    return { ok: false, error: "Error al crear la cuenta empresarial" };
  }
}
