import { beforeEach, describe, expect, it, vi } from "vitest";

import { Prisma } from "src/generated/prisma/client";
import type { DynamicRecord } from "src/lib/posts/dynamics/rules";

const prismaMock = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  $transaction: vi.fn(),
}));

vi.mock("src/lib/db", () => ({
  default: prismaMock,
}));

import { evaluateAndCloseDynamic } from "src/lib/posts/dynamics/close";
import { applyConsumptionForCreditedCharge } from "src/lib/posts/dynamics/consumption";
import { participateInDynamic } from "src/lib/posts/dynamics/participate";
import {
  parsePostDynamicCreate,
  toPostDynamicWriteData,
} from "src/lib/posts/dynamics/schemas";
import {
  toAuthorDynamicSummary,
  toPublicDynamicSummary,
} from "src/lib/posts/dynamics/summary";

const NOW = new Date("2026-10-26T18:00:00.000Z");
const ESTABLISHMENT = "11111111-1111-4111-8111-111111111111";
const MATCHING_PRODUCT = "22222222-2222-4222-8222-222222222222";
const OTHER_PRODUCT = "33333333-3333-4333-8333-333333333333";

type ParticipationRow = {
  participation_id: string;
  dynamic_id: string;
  user_id: string;
  source: string;
  charge_id: string | null;
  person_key: string | null;
};

function cloneRecord(row: DynamicRecord): DynamicRecord {
  return {
    ...row,
    progress_amount: new Prisma.Decimal(row.progress_amount),
    starts_at: row.starts_at ? new Date(row.starts_at) : null,
    ends_at: row.ends_at ? new Date(row.ends_at) : null,
    closed_at: row.closed_at ? new Date(row.closed_at) : null,
  };
}

function activeRow(
  partial: Partial<DynamicRecord> & Pick<DynamicRecord, "dynamic_id" | "kind" | "config">
): DynamicRecord {
  return {
    post_id: "post-1",
    establishment_id: null,
    status: "active",
    progress_count: 0,
    progress_amount: new Prisma.Decimal(0),
    goal_count: null,
    starts_at: null,
    ends_at: null,
    closed_at: null,
    token: null,
    ...partial,
  };
}

function memoryTx(
  initial: DynamicRecord[],
  seeded: ParticipationRow[] = []
) {
  const rows = new Map(initial.map((row) => [row.dynamic_id, cloneRecord(row)]));
  const participations = seeded.map((row) => ({ ...row }));
  let participationSeq = seeded.length;

  const tx = {
    postDynamic: {
      findUnique: vi.fn(async ({ where }: { where: { dynamic_id: string } }) => {
        const row = rows.get(where.dynamic_id);
        return row ? cloneRecord(row) : null;
      }),
      findMany: vi.fn(
        async ({
          where,
        }: {
          where: { establishment_id?: string; kind?: string; status?: string };
        }) => {
          return [...rows.values()]
            .filter((row) => {
              if (where.kind && row.kind !== where.kind) return false;
              if (where.status && row.status !== where.status) return false;
              if (
                where.establishment_id &&
                row.establishment_id !== where.establishment_id
              ) {
                return false;
              }
              return true;
            })
            .map((row) => ({ dynamic_id: row.dynamic_id }));
        }
      ),
      updateMany: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { dynamic_id: string; status?: string };
          data: { status: DynamicRecord["status"]; closed_at: Date };
        }) => {
          const row = rows.get(where.dynamic_id);
          if (!row || (where.status && row.status !== where.status)) {
            return { count: 0 };
          }
          row.status = data.status;
          row.closed_at = data.closed_at;
          return { count: 1 };
        }
      ),
      update: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { dynamic_id: string };
          data: {
            progress_count?: { increment: number };
            progress_amount?: { increment: Prisma.Decimal };
          };
        }) => {
          const row = rows.get(where.dynamic_id);
          if (!row) throw new Error("missing dynamic");
          if (data.progress_count?.increment) {
            row.progress_count += data.progress_count.increment;
          }
          if (data.progress_amount?.increment) {
            row.progress_amount = row.progress_amount.add(
              data.progress_amount.increment
            );
          }
          return cloneRecord(row);
        }
      ),
    },
    postDynamicParticipation: {
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const found = participations.find((item) =>
          Object.entries(where).every(
            ([key, value]) => item[key as keyof ParticipationRow] === value
          )
        );
        return found ? { participation_id: found.participation_id } : null;
      }),
      create: vi.fn(async ({ data }: { data: Omit<ParticipationRow, "participation_id"> }) => {
        participationSeq += 1;
        const created = {
          participation_id: `part-${participationSeq}`,
          ...data,
        };
        participations.push(created);
        return { participation_id: created.participation_id };
      }),
    },
    chargeLineItem: {
      findMany: vi.fn(async () => [] as { product_id: string | null }[]),
    },
  };

  return { tx, rows, participations };
}

describe("evaluateAndCloseDynamic", () => {
  it("expires an active dynamic after ends_at and leaves the boundary open", async () => {
    const open = activeRow({
      dynamic_id: "dyn-open",
      kind: "time_promo",
      config: { text: "2x1" },
      starts_at: new Date("2026-10-26T12:00:00.000Z"),
      ends_at: NOW,
    });
    const due = activeRow({
      dynamic_id: "dyn-due",
      kind: "time_promo",
      config: { text: "2x1" },
      starts_at: new Date("2026-10-26T12:00:00.000Z"),
      ends_at: new Date(NOW.getTime() - 1),
    });
    const { tx, rows } = memoryTx([open, due]);

    const stillOpen = await evaluateAndCloseDynamic(
      tx as never,
      "dyn-open",
      NOW
    );
    const expired = await evaluateAndCloseDynamic(tx as never, "dyn-due", NOW);

    expect(stillOpen?.status).toBe("active");
    expect(stillOpen?.closed_at).toBeNull();
    expect(expired).toMatchObject({ status: "expired", closed_at: NOW });
    expect(rows.get("dyn-due")?.status).toBe("expired");
    expect(tx.postDynamic.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.postDynamic.updateMany).toHaveBeenCalledWith({
      where: { dynamic_id: "dyn-due", status: "active" },
      data: { status: "expired", closed_at: NOW },
    });
  });

  it("exhausts by quota before a passed window", async () => {
    const met = activeRow({
      dynamic_id: "dyn-met",
      kind: "going",
      config: { text: "¿Vienes?" },
      goal_count: 3,
      progress_count: 3,
      ends_at: new Date("2026-10-27T18:00:00.000Z"),
    });
    const shortAndLate = activeRow({
      dynamic_id: "dyn-late",
      kind: "going",
      config: { text: "¿Vienes?" },
      goal_count: 3,
      progress_count: 2,
      ends_at: new Date(NOW.getTime() - 1),
    });
    const both = activeRow({
      dynamic_id: "dyn-both",
      kind: "going",
      config: { text: "¿Vienes?" },
      goal_count: 3,
      progress_count: 3,
      ends_at: new Date(NOW.getTime() - 1),
    });
    const { tx } = memoryTx([met, shortAndLate, both]);

    await expect(evaluateAndCloseDynamic(tx as never, "dyn-met", NOW)).resolves.toMatchObject({
      status: "exhausted",
    });
    await expect(evaluateAndCloseDynamic(tx as never, "dyn-late", NOW)).resolves.toMatchObject({
      status: "expired",
    });
    await expect(evaluateAndCloseDynamic(tx as never, "dyn-both", NOW)).resolves.toMatchObject({
      status: "exhausted",
    });
  });
});

describe("participateInDynamic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue({
      user_id: "user-1",
      type: "user",
      status: "active",
    });
  });

  it("redeems a promo code once and exhausts the dynamic", async () => {
    const parsed = parsePostDynamicCreate({
      kind: "promo_code",
      code: "cafe26",
      benefit: "Postre gratis",
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const write = toPostDynamicWriteData(parsed.data);
    expect(write.goal_count).toBe(1);
    expect(write.token).toBeNull();
    expect(write.config).toMatchObject({
      code: "CAFE26",
      benefit: "Postre gratis",
    });

    const { tx, rows } = memoryTx([
      activeRow({
        dynamic_id: "dyn-code",
        kind: "promo_code",
        config: write.config,
        goal_count: write.goal_count,
      }),
    ]);
    prismaMock.$transaction.mockImplementation(
      async (fn: (client: typeof tx) => unknown) => fn(tx)
    );

    const result = await participateInDynamic({
      dynamicId: "dyn-code",
      userId: "user-1",
      source: "promo_code",
      code: "cafe26",
      now: NOW,
    });

    expect(result).toMatchObject({
      ok: true,
      dynamic: {
        status: "exhausted",
        phase: "exhausted",
        text: "Postre gratis",
        progress_count: 1,
        viewer_participated: true,
      },
    });
    expect(JSON.stringify(result)).not.toContain("CAFE26");
    expect(tx.postDynamicParticipation.create).toHaveBeenCalledWith({
      data: {
        dynamic_id: "dyn-code",
        user_id: "user-1",
        source: "promo_code",
        charge_id: null,
        person_key: "user-1",
      },
      select: { participation_id: true },
    });
    expect(rows.get("dyn-code")).toMatchObject({
      status: "exhausted",
      progress_count: 1,
      closed_at: NOW,
    });
  });

  it("rejects a second Voy from the same person", async () => {
    const { tx } = memoryTx(
      [
        activeRow({
          dynamic_id: "dyn-going",
          kind: "going",
          config: { text: "¿Vienes?" },
          goal_count: 10,
        }),
      ],
      [
        {
          participation_id: "part-existing",
          dynamic_id: "dyn-going",
          user_id: "user-1",
          source: "going",
          charge_id: null,
          person_key: "user-1",
        },
      ]
    );
    prismaMock.$transaction.mockImplementation(
      async (fn: (client: typeof tx) => unknown) => fn(tx)
    );

    const result = await participateInDynamic({
      dynamicId: "dyn-going",
      userId: "user-1",
      source: "going",
      now: NOW,
    });

    expect(result).toEqual({
      ok: false,
      code: "already_participated",
      status: 409,
      error: "Ya participaste en esta dinámica.",
    });
    expect(tx.postDynamicParticipation.create).not.toHaveBeenCalled();
    expect(tx.postDynamic.update).not.toHaveBeenCalled();
  });
});

describe("applyConsumptionForCreditedCharge", () => {
  const charge = {
    chargeId: "charge-1",
    establishmentId: ESTABLISHMENT,
    userId: "user-1",
    amount: "120.00",
    now: NOW,
  };

  function consumptionFrom(input: unknown, dynamicId: string, extra: Partial<DynamicRecord> = {}) {
    const parsed = parsePostDynamicCreate(input);
    if (!parsed.ok) throw new Error(parsed.error);
    const write = toPostDynamicWriteData(parsed.data);
    return activeRow({
      dynamic_id: dynamicId,
      kind: "consumption",
      establishment_id: write.establishment_id,
      config: write.config,
      goal_count: write.goal_count,
      ...extra,
    });
  }

  it("counts the charge only when the ticket and product match, and closes a filled quota", async () => {
    const tooSmall = consumptionFrom(
      {
        kind: "consumption",
        establishment_id: ESTABLISHMENT,
        goal_mode: "count",
        goal_count: 4,
        min_ticket: "500.00",
        product_ids: [MATCHING_PRODUCT],
      },
      "dyn-small"
    );
    const wrongProduct = consumptionFrom(
      {
        kind: "consumption",
        establishment_id: ESTABLISHMENT,
        goal_mode: "count",
        goal_count: 4,
        min_ticket: "50.00",
        product_ids: [OTHER_PRODUCT],
      },
      "dyn-product"
    );
    const match = consumptionFrom(
      {
        kind: "consumption",
        establishment_id: ESTABLISHMENT,
        goal_mode: "count",
        goal_count: 1,
        min_ticket: "100.00",
        product_ids: [MATCHING_PRODUCT],
      },
      "dyn-match"
    );
    const { tx, rows } = memoryTx([tooSmall, wrongProduct, match]);
    tx.chargeLineItem.findMany.mockResolvedValue([
      { product_id: MATCHING_PRODUCT },
    ]);

    const result = await applyConsumptionForCreditedCharge(tx as never, charge);

    expect(result.appliedDynamicIds).toEqual(["dyn-match"]);
    expect(rows.get("dyn-small")?.progress_count).toBe(0);
    expect(rows.get("dyn-product")?.progress_count).toBe(0);
    expect(rows.get("dyn-match")).toMatchObject({
      progress_count: 1,
      status: "exhausted",
    });
    expect(rows.get("dyn-match")?.progress_amount.toFixed(2)).toBe("120.00");
    expect(tx.postDynamicParticipation.create).toHaveBeenCalledTimes(1);
    expect(tx.postDynamicParticipation.create).toHaveBeenCalledWith({
      data: {
        dynamic_id: "dyn-match",
        user_id: "user-1",
        source: "charge",
        charge_id: "charge-1",
        person_key: null,
      },
    });
  });

  it("does not count the same charge twice", async () => {
    const match = consumptionFrom(
      {
        kind: "consumption",
        establishment_id: ESTABLISHMENT,
        goal_mode: "amount",
        goal_amount: "500.00",
        min_ticket: "100.00",
        product_ids: [MATCHING_PRODUCT],
      },
      "dyn-open"
    );
    const { tx, rows } = memoryTx([match]);
    tx.chargeLineItem.findMany.mockResolvedValue([
      { product_id: MATCHING_PRODUCT },
    ]);

    const first = await applyConsumptionForCreditedCharge(tx as never, charge);
    const second = await applyConsumptionForCreditedCharge(tx as never, charge);

    expect(first.appliedDynamicIds).toEqual(["dyn-open"]);
    expect(second.appliedDynamicIds).toEqual([]);
    expect(rows.get("dyn-open")).toMatchObject({
      progress_count: 1,
      status: "active",
    });
    expect(rows.get("dyn-open")?.progress_amount.toFixed(2)).toBe("120.00");
    expect(tx.postDynamicParticipation.create).toHaveBeenCalledTimes(1);
  });

  it("expires a consumption dynamic by time without counting the charge", async () => {
    const late = consumptionFrom(
      {
        kind: "consumption",
        establishment_id: ESTABLISHMENT,
        goal_mode: "count",
        goal_count: 3,
        min_ticket: "100.00",
        product_ids: [MATCHING_PRODUCT],
      },
      "dyn-late",
      { ends_at: new Date(NOW.getTime() - 1) }
    );
    const { tx, rows } = memoryTx([late]);
    tx.chargeLineItem.findMany.mockResolvedValue([
      { product_id: MATCHING_PRODUCT },
    ]);

    const result = await applyConsumptionForCreditedCharge(tx as never, charge);

    expect(result.appliedDynamicIds).toEqual([]);
    expect(rows.get("dyn-late")).toMatchObject({
      status: "expired",
      progress_count: 0,
    });
    expect(tx.postDynamicParticipation.create).not.toHaveBeenCalled();
  });
});

describe("toPublicDynamicSummary", () => {
  it("omits the promo code and the QR token", () => {
    const summary = toPublicDynamicSummary(
      activeRow({
        dynamic_id: "dyn-qr",
        kind: "qr",
        config: { text: "Escanea y listo", code: "SECRETO" },
        goal_count: 20,
        token: "qr-token-secret-value",
        starts_at: new Date("2026-10-27T18:00:00.000Z"),
      }),
      { now: NOW, viewerParticipated: false }
    );

    expect(summary.phase).toBe("upcoming");
    expect(summary.text).toBe("Escanea y listo");
    expect(summary).not.toHaveProperty("token");
    expect(summary).not.toHaveProperty("code");
    const encoded = JSON.stringify(summary);
    expect(encoded).not.toContain("qr-token-secret-value");
    expect(encoded).not.toContain("SECRETO");
  });
});

describe("toAuthorDynamicSummary", () => {
  it("adds the promo code for the author and still omits the QR token", () => {
    const promo = toAuthorDynamicSummary(
      activeRow({
        dynamic_id: "dyn-code",
        kind: "promo_code",
        config: { code: "cafe26", benefit: "Café" },
        goal_count: 1,
        token: "should-not-leak",
      }),
      { now: NOW }
    );
    const qr = toAuthorDynamicSummary(
      activeRow({
        dynamic_id: "dyn-qr",
        kind: "qr",
        config: { text: "Escanea" },
        goal_count: 1,
        token: "qr-token-secret-value",
      }),
      { now: NOW }
    );

    expect(promo.code).toBe("CAFE26");
    expect(promo.text).toBe("Café");
    expect(qr).not.toHaveProperty("code");
    const encoded = JSON.stringify({ promo, qr });
    expect(encoded).not.toContain("qr-token-secret-value");
    expect(encoded).not.toContain("should-not-leak");
  });
});
