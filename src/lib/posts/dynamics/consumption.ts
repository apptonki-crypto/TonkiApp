import { Prisma } from "src/generated/prisma/client";

import {
  isChainAuthoritative,
  isChainRequiredButUnavailable,
  isShadowMirrored,
} from "src/lib/posts/chain/authority";
import { toCentavos } from "src/lib/posts/chain/hashes";
import { enqueueChainJob } from "src/lib/posts/chain/jobs";
import { evaluateAndCloseDynamic } from "src/lib/posts/dynamics/close";
import {
  closeTransition,
  consumptionChargeMatches,
  isUniqueConflict,
  type DynamicRecord,
} from "src/lib/posts/dynamics/rules";

export type ConsumptionApplyInput = {
  chargeId: string;
  establishmentId: string;
  userId: string;
  amount: Prisma.Decimal | number | string;
  now?: Date;
};

export type ConsumptionApplyResult = {
  /** Applied right now in the database. */
  appliedDynamicIds: string[];
  /** Handed to the chain worker (contract-managed, or shadow copies). */
  queuedDynamicIds: string[];
};

async function queueConsumption(
  tx: Prisma.TransactionClient,
  dynamic: DynamicRecord,
  input: ConsumptionApplyInput,
  amount: Prisma.Decimal
): Promise<void> {
  await enqueueChainJob(tx, {
    dynamicId: dynamic.dynamic_id,
    type: "consume",
    dedupeKey: input.chargeId,
    contractId: dynamic.contract_id ?? null,
    payload: {
      charge_id: input.chargeId,
      user_id: input.userId,
      amount_centavos: toCentavos(amount).toString(),
    },
  });
}

export async function applyConsumptionForCreditedCharge(
  tx: Prisma.TransactionClient,
  input: ConsumptionApplyInput
): Promise<ConsumptionApplyResult> {
  const now = input.now ?? new Date();
  const amount = new Prisma.Decimal(input.amount);
  const lineItems = await tx.chargeLineItem.findMany({
    where: { charge_id: input.chargeId },
    select: { product_id: true },
  });
  const productIds = new Set(
    lineItems.flatMap((item) => (item.product_id ? [item.product_id] : []))
  );

  const dynamics = await tx.postDynamic.findMany({
    where: {
      establishment_id: input.establishmentId,
      kind: "consumption",
      status: "active",
    },
    orderBy: [{ created_at: "asc" }, { dynamic_id: "asc" }],
    select: { dynamic_id: true },
  });

  const appliedDynamicIds: string[] = [];
  const queuedDynamicIds: string[] = [];

  for (const row of dynamics) {
    const dynamic = await evaluateAndCloseDynamic(tx, row.dynamic_id, now);
    if (!dynamic || dynamic.status !== "active") continue;
    if (dynamic.starts_at && now.getTime() < dynamic.starts_at.getTime()) continue;
    if (!consumptionChargeMatches(dynamic, amount, productIds)) continue;

    // The contract decides: the charge is queued and the database is updated from the
    // contract once confirmed. The credit itself never waits for Stellar.
    if (isChainAuthoritative(dynamic) || isChainRequiredButUnavailable(dynamic)) {
      if (dynamic.chain_status === "failed") continue;
      if (closeTransition(dynamic, now)) continue;
      await queueConsumption(tx, dynamic, input, amount);
      queuedDynamicIds.push(dynamic.dynamic_id);
      continue;
    }

    const existing = await tx.postDynamicParticipation.findFirst({
      where: { dynamic_id: dynamic.dynamic_id, charge_id: input.chargeId },
      select: { participation_id: true },
    });
    if (existing) continue;

    try {
      await tx.postDynamicParticipation.create({
        data: {
          dynamic_id: dynamic.dynamic_id,
          user_id: input.userId,
          source: "charge",
          charge_id: input.chargeId,
          person_key: null,
        },
      });
    } catch (err) {
      if (isUniqueConflict(err)) continue;
      throw err;
    }

    await tx.postDynamic.update({
      where: { dynamic_id: dynamic.dynamic_id },
      data: {
        progress_count: { increment: 1 },
        progress_amount: { increment: amount },
      },
    });
    appliedDynamicIds.push(dynamic.dynamic_id);
    await evaluateAndCloseDynamic(tx, dynamic.dynamic_id, now);

    // Shadow mode: applied above; copy it to the contract for comparison.
    if (isShadowMirrored(dynamic)) {
      await queueConsumption(tx, dynamic, input, amount);
      queuedDynamicIds.push(dynamic.dynamic_id);
    }
  }

  return { appliedDynamicIds, queuedDynamicIds };
}
