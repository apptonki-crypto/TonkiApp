import { beforeEach, describe, expect, it, vi } from "vitest";

import { Prisma } from "src/generated/prisma/client";
import type { DynamicRecord } from "src/lib/posts/dynamics";

const prismaMock = vi.hoisted(() => ({
  postDynamic: { findMany: vi.fn() },
  postDynamicParticipation: { findMany: vi.fn() },
  $transaction: vi.fn(),
}));

const evaluateMock = vi.hoisted(() => vi.fn());

vi.mock("src/lib/db", () => ({
  default: prismaMock,
}));

vi.mock("src/lib/posts/dynamics", async (importOriginal) => {
  const actual = await importOriginal<typeof import("src/lib/posts/dynamics")>();
  return { ...actual, evaluateAndCloseDynamic: evaluateMock };
});

import { loadPublicDynamicsByPost } from "src/lib/posts/loadPublicDynamics";

const NOW = new Date("2026-10-26T18:00:00.000Z");
const POST_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ACTIVE_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PROMO_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const VIEWER = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

function row(partial: Record<string, unknown>) {
  return {
    post_id: POST_ID,
    establishment_id: null,
    progress_count: 0,
    progress_amount: new Prisma.Decimal(0),
    goal_count: null,
    starts_at: null,
    ends_at: null,
    closed_at: null,
    created_at: NOW,
    ...partial,
  };
}

describe("loadPublicDynamicsByPost", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$transaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<void>) => fn({ tx: true })
    );
    prismaMock.postDynamicParticipation.findMany.mockResolvedValue([]);
  });

  it("persists closure for active dynamics and hides code and token", async () => {
    prismaMock.postDynamic.findMany.mockResolvedValue([
      row({
        dynamic_id: ACTIVE_ID,
        kind: "going",
        status: "active",
        config: { text: "Voy" },
        goal_count: 5,
        created_at: new Date("2026-10-26T10:00:00.000Z"),
      }),
      row({
        dynamic_id: PROMO_ID,
        kind: "promo_code",
        status: "exhausted",
        config: { code: "SECRETO", benefit: "Café" },
        goal_count: 1,
        progress_count: 1,
        closed_at: NOW,
        created_at: new Date("2026-10-26T11:00:00.000Z"),
      }),
    ]);
    evaluateMock.mockImplementation(async () => {
      const closed: DynamicRecord = {
        dynamic_id: ACTIVE_ID,
        post_id: POST_ID,
        establishment_id: null,
        kind: "going",
        status: "exhausted",
        config: { text: "Voy" },
        progress_count: 5,
        progress_amount: new Prisma.Decimal(0),
        goal_count: 5,
        starts_at: null,
        ends_at: null,
        closed_at: NOW,
        token: "super-secret-token",
      };
      return closed;
    });
    prismaMock.postDynamicParticipation.findMany.mockResolvedValue([
      { dynamic_id: PROMO_ID },
    ]);

    const grouped = await loadPublicDynamicsByPost([POST_ID], VIEWER, NOW);
    const summaries = grouped.get(POST_ID) ?? [];

    expect(evaluateMock).toHaveBeenCalledTimes(1);
    expect(evaluateMock).toHaveBeenCalledWith(
      { tx: true },
      ACTIVE_ID,
      NOW
    );
    expect(prismaMock.postDynamic.findMany.mock.calls[0][0].select).not.toHaveProperty(
      "token"
    );
    expect(summaries.map((item) => item.dynamic_id)).toEqual([ACTIVE_ID, PROMO_ID]);
    expect(summaries[0]).toMatchObject({
      kind: "going",
      status: "exhausted",
      phase: "exhausted",
      text: "Voy",
      viewer_participated: false,
    });
    expect(summaries[1]).toMatchObject({
      kind: "promo_code",
      text: "Café",
      viewer_participated: true,
    });
    expect(summaries[0]).not.toHaveProperty("token");
    expect(summaries[0]).not.toHaveProperty("code");
    const encoded = JSON.stringify(summaries);
    expect(encoded).not.toContain("SECRETO");
    expect(encoded).not.toContain("super-secret-token");
  });

  it("includes the promo code only when the caller asks for the author view", async () => {
    prismaMock.postDynamic.findMany.mockResolvedValue([
      row({
        dynamic_id: ACTIVE_ID,
        kind: "going",
        status: "exhausted",
        config: { text: "Voy" },
        goal_count: 1,
        progress_count: 1,
        closed_at: NOW,
      }),
      row({
        dynamic_id: PROMO_ID,
        kind: "promo_code",
        status: "exhausted",
        config: { code: "cafe26", benefit: "Café" },
        goal_count: 1,
        progress_count: 1,
        closed_at: NOW,
      }),
    ]);

    const grouped = await loadPublicDynamicsByPost([POST_ID], VIEWER, NOW, {
      includeAuthorCode: true,
    });
    const summaries = grouped.get(POST_ID) ?? [];

    expect(summaries[0]).not.toHaveProperty("code");
    expect(summaries[1]).toMatchObject({ kind: "promo_code", code: "CAFE26" });
    expect(JSON.stringify(summaries)).not.toContain("token");
  });

  it("does not open a transaction when nothing is active", async () => {
    prismaMock.postDynamic.findMany.mockResolvedValue([
      row({
        dynamic_id: PROMO_ID,
        kind: "time_promo",
        status: "expired",
        config: { text: "Terminó" },
        closed_at: NOW,
      }),
    ]);

    const grouped = await loadPublicDynamicsByPost([POST_ID], VIEWER, NOW);

    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(evaluateMock).not.toHaveBeenCalled();
    expect(grouped.get(POST_ID)?.[0]).toMatchObject({
      status: "expired",
      phase: "expired",
      text: "Terminó",
    });
  });

  it("skips the database when there are no posts", async () => {
    const grouped = await loadPublicDynamicsByPost([], VIEWER, NOW);
    expect(grouped.size).toBe(0);
    expect(prismaMock.postDynamic.findMany).not.toHaveBeenCalled();
  });
});
