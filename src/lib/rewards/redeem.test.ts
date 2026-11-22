import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  $transaction: vi.fn(),
}));

vi.mock("src/lib/db", () => ({
  default: prismaMock,
}));

import {
  cancelPrizeRedemption,
  deliverPrizeRedemption,
  orderRedemptionsForCounter,
  redeemCatalogPrize,
  redemptionCodeFromBytes,
} from "./redeem";
import type { PrizeRedemptionItem } from "./types";

type Stored = {
  redemption_id: string;
  user_id: string;
  establishment_id: string;
  establishment_reward_id: string;
  title: string;
  points: number;
  code: string;
  status: string;
  created_at: Date;
  delivered_at: Date | null;
  cancelled_at: Date | null;
};

function createHarness() {
  const earned = { points: 100 };
  const redemptions: Stored[] = [];
  let failNextCreate = false;
  const catalog = {
    establishment_reward_id: "prize-1",
    title: "Café",
    value_tonkis: 40,
    establishment_id: "est-1",
    establishment: { name: "El Campestre" },
  };
  const owner = { adminId: "admin-1" };

  const tx = {
    $queryRaw: vi.fn(async (strings: TemplateStringsArray) => {
      const sql = strings.join(" ");
      if (sql.includes("AS earned")) return [{ earned: earned.points }];
      if (sql.includes("AS held")) {
        const held = redemptions
          .filter((row) => row.status === "pending" || row.status === "delivered")
          .reduce((sum, row) => sum + row.points, 0);
        return [{ held }];
      }
      return [];
    }),
    establishmentReward: {
      findUnique: vi.fn(async () => catalog),
    },
    user: {
      findUnique: vi.fn(async () => ({ name: "Ana" })),
    },
    prizeRedemption: {
      create: vi.fn(async ({ data }: { data: Omit<Stored, "redemption_id" | "delivered_at" | "cancelled_at"> }) => {
        if (failNextCreate) {
          failNextCreate = false;
          const err = new Error("unique") as Error & { code: string };
          err.code = "P2002";
          throw err;
        }
        const row: Stored = {
          redemption_id: `red-${redemptions.length + 1}`,
          delivered_at: null,
          cancelled_at: null,
          ...data,
        };
        redemptions.push(row);
        return row;
      }),
      findUnique: vi.fn(async ({ where }: { where: { redemption_id: string } }) => {
        const row = redemptions.find((item) => item.redemption_id === where.redemption_id);
        if (!row) return null;
        return {
          ...row,
          establishment: { admin_id: owner.adminId, name: "El Campestre" },
          user: { name: "Ana" },
        };
      }),
      updateMany: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { redemption_id: string; status: string };
          data: Partial<Stored>;
        }) => {
          const row = redemptions.find((item) => item.redemption_id === where.redemption_id);
          if (!row || row.status !== where.status) return { count: 0 };
          Object.assign(row, data);
          return { count: 1 };
        }
      ),
    },
  };

  return {
    tx,
    earned,
    redemptions,
    catalog,
    owner,
    failNextCreate: () => {
      failNextCreate = true;
    },
    hideCatalog: () => {
      tx.establishmentReward.findUnique.mockResolvedValue(
        null as unknown as typeof catalog
      );
    },
  };
}

describe("redemptionCodeFromBytes", () => {
  it("builds an 8 character code without ambiguous glyphs", () => {
    const code = redemptionCodeFromBytes(new Uint8Array([0, 1, 10, 31, 32, 255, 7, 18]));
    expect(code).toHaveLength(8);
    expect(code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
  });
});

describe("orderRedemptionsForCounter", () => {
  it("keeps pending redemptions above delivered ones", () => {
    const items = [
      item("delivered", "2026-11-22T12:00:00.000Z"),
      item("pending", "2026-11-22T11:00:00.000Z"),
    ];
    expect(orderRedemptionsForCounter(items).map((row) => row.status)).toEqual([
      "pending",
      "delivered",
    ]);
  });
});

describe("prize redemption", () => {
  const harness = createHarness();

  beforeEach(() => {
    vi.clearAllMocks();
    harness.earned.points = 100;
    harness.redemptions.splice(0);
    harness.catalog.value_tonkis = 40;
    harness.catalog.establishment_reward_id = "prize-1";
    harness.owner.adminId = "admin-1";
    harness.tx.establishmentReward.findUnique.mockResolvedValue(harness.catalog);
    prismaMock.$transaction.mockImplementation(async (fn: (client: typeof harness.tx) => unknown) =>
      fn(harness.tx)
    );
  });

  it("reserves the exact balance and refuses a second prize", async () => {
    harness.earned.points = 40;
    const first = await redeemCatalogPrize({
      userId: "user-1",
      establishmentRewardId: "prize-1",
      createCode: () => "CAFE2345",
    });
    expect(first).toMatchObject({
      ok: true,
      total_points: 0,
      redemption: { status: "pending", points: 40, code: "CAFE2345", title: "Café" },
    });

    const second = await redeemCatalogPrize({
      userId: "user-1",
      establishmentRewardId: "prize-1",
      createCode: () => "CAFE2346",
    });
    expect(second).toMatchObject({
      ok: false,
      status: 409,
      error: "No te alcanzan los Tonkis para este premio.",
    });
    expect(harness.redemptions).toHaveLength(1);
  });

  it("rejects a missing or free catalog item before writing", async () => {
    harness.hideCatalog();
    const missing = await redeemCatalogPrize({
      userId: "user-1",
      establishmentRewardId: "nope",
    });
    expect(missing).toMatchObject({ ok: false, status: 404 });

    harness.tx.establishmentReward.findUnique.mockResolvedValue({
      ...harness.catalog,
      value_tonkis: 0,
    });
    const free = await redeemCatalogPrize({
      userId: "user-1",
      establishmentRewardId: "prize-1",
    });
    expect(free).toMatchObject({ ok: false, status: 400 });
    expect(harness.redemptions).toHaveLength(0);
  });

  it("retries when the counter code collides", async () => {
    const codes = ["CAFE2345", "CAFE2346"];
    harness.failNextCreate();
    const result = await redeemCatalogPrize({
      userId: "user-1",
      establishmentRewardId: "prize-1",
      createCode: () => codes.shift() ?? "CAFE2347",
    });
    expect(result).toMatchObject({ ok: true, redemption: { code: "CAFE2346" } });
  });

  it("lets the business deliver once, and a later cancel does not return the prize", async () => {
    await redeemCatalogPrize({
      userId: "user-1",
      establishmentRewardId: "prize-1",
      createCode: () => "CAFE2345",
    });
    const delivered = await deliverPrizeRedemption({
      adminId: "admin-1",
      redemptionId: "red-1",
    });
    expect(delivered).toMatchObject({ ok: true, redemption: { status: "delivered" } });

    const again = await deliverPrizeRedemption({
      adminId: "admin-1",
      redemptionId: "red-1",
    });
    expect(again).toMatchObject({ ok: false, status: 409 });

    const cancelled = await cancelPrizeRedemption({
      actorUserId: "user-1",
      actorType: "user",
      redemptionId: "red-1",
    });
    expect(cancelled).toMatchObject({ ok: false, status: 409 });
    expect(harness.redemptions[0]?.status).toBe("delivered");
  });

  it("returns the points when the customer cancels while it is still pending", async () => {
    harness.earned.points = 40;
    await redeemCatalogPrize({
      userId: "user-1",
      establishmentRewardId: "prize-1",
      createCode: () => "CAFE2345",
    });
    const cancelled = await cancelPrizeRedemption({
      actorUserId: "user-1",
      actorType: "user",
      redemptionId: "red-1",
    });
    expect(cancelled).toMatchObject({ ok: true, redemption: { status: "cancelled" } });

    const again = await redeemCatalogPrize({
      userId: "user-1",
      establishmentRewardId: "prize-1",
      createCode: () => "CAFE2346",
    });
    expect(again).toMatchObject({ ok: true, total_points: 0 });
  });

  it("hides a redemption from another business and from another customer", async () => {
    await redeemCatalogPrize({
      userId: "user-1",
      establishmentRewardId: "prize-1",
      createCode: () => "CAFE2345",
    });
    harness.owner.adminId = "admin-2";
    const foreign = await deliverPrizeRedemption({
      adminId: "admin-1",
      redemptionId: "red-1",
    });
    expect(foreign).toMatchObject({ ok: false, status: 404 });
    expect(harness.redemptions[0]?.status).toBe("pending");

    harness.owner.adminId = "admin-1";
    const otherCustomer = await cancelPrizeRedemption({
      actorUserId: "user-2",
      actorType: "user",
      redemptionId: "red-1",
    });
    expect(otherCustomer).toMatchObject({ ok: false, status: 404 });
    expect(harness.redemptions[0]?.status).toBe("pending");
  });
});

function item(status: PrizeRedemptionItem["status"], createdAt: string): PrizeRedemptionItem {
  return {
    id: createdAt,
    title: "Café",
    points: 40,
    code: "CAFE2345",
    status,
    establishment_id: "est-1",
    establishment_name: "El Campestre",
    customer_name: "Ana",
    created_at: createdAt,
    delivered_at: null,
  };
}
