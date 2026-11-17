import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Prisma } from "src/generated/prisma/client";

type Row = {
  dynamic_id: string;
  post_id: string;
  establishment_id: string | null;
  kind: string;
  status: string;
  config: unknown;
  progress_count: number;
  progress_amount: Prisma.Decimal;
  goal_count: number | null;
  starts_at: Date | null;
  ends_at: Date | null;
  closed_at: Date | null;
  token: string | null;
  chain_status: string;
  contract_id: string | null;
  deploy_tx_hash: string | null;
};

type Part = {
  participation_id: string;
  dynamic_id: string;
  user_id: string;
  source: string;
  charge_id: string | null;
  person_key: string | null;
  tx_hash: string | null;
};

const store = vi.hoisted(() => ({
  rows: new Map<string, unknown>(),
  parts: [] as unknown[],
  jobs: [] as Array<Record<string, unknown>>,
  seq: 0,
}));

function matches(where: Record<string, unknown>, item: Record<string, unknown>) {
  return Object.entries(where).every(([key, value]) => {
    if (value && typeof value === "object" && !(value instanceof Date)) return true;
    return item[key] === value;
  });
}

const prismaMock = vi.hoisted(() => {
  const clone = (row: unknown) => (row ? { ...(row as object) } : null);
  const mock = {
    user: {
      findUnique: vi.fn(async () => ({ user_id: "u", type: "user", status: "active" })),
    },
    postDynamic: {
      findUnique: vi.fn(async ({ where }: { where: { dynamic_id: string } }) =>
        clone(store.rows.get(where.dynamic_id))
      ),
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
        [...store.rows.values()]
          .filter((row) => matches(where, row as Record<string, unknown>))
          .map((row) => ({ dynamic_id: (row as { dynamic_id: string }).dynamic_id }))
      ),
      updateMany: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { dynamic_id: string; status?: string; contract_id?: string };
          data: Record<string, unknown>;
        }) => {
          const row = store.rows.get(where.dynamic_id) as Record<string, unknown> | undefined;
          if (!row || !matches(where, row)) return { count: 0 };
          Object.assign(row, data);
          return { count: 1 };
        }
      ),
      update: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { dynamic_id: string };
          data: Record<string, unknown>;
        }) => {
          const row = store.rows.get(where.dynamic_id) as Record<string, unknown>;
          for (const [key, value] of Object.entries(data)) {
            if (value && typeof value === "object" && "increment" in value) {
              const inc = (value as { increment: unknown }).increment;
              row[key] =
                row[key] instanceof Prisma.Decimal
                  ? (row[key] as Prisma.Decimal).add(inc as Prisma.Decimal)
                  : (row[key] as number) + (inc as number);
            } else {
              row[key] = value;
            }
          }
          return clone(row);
        }
      ),
    },
    postDynamicParticipation: {
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const found = store.parts.find((part) =>
          matches(where, part as Record<string, unknown>)
        );
        return found ? clone(found) : null;
      }),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const dup = store.parts.some((part) => {
          const p = part as Record<string, unknown>;
          return (
            p.dynamic_id === data.dynamic_id &&
            ((data.person_key != null && p.person_key === data.person_key) ||
              (data.charge_id != null && p.charge_id === data.charge_id))
          );
        });
        if (dup) {
          throw new Prisma.PrismaClientKnownRequestError("dup", {
            code: "P2002",
            clientVersion: "test",
          });
        }
        store.seq += 1;
        const created = { participation_id: `part-${store.seq}`, tx_hash: null, ...data };
        store.parts.push(created);
        return { participation_id: created.participation_id };
      }),
      update: vi.fn(async () => ({})),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    chargeLineItem: { findMany: vi.fn(async () => []) },
    dynamicChainJob: {
      upsert: vi.fn(async ({ create }: { create: Record<string, unknown> }) => {
        store.jobs.push(create);
        return create;
      }),
    },
    $transaction: vi.fn(),
  };
  mock.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(mock));
  return mock;
});

vi.mock("src/lib/db", () => ({ default: prismaMock }));

import { setDynamicChainForTests } from "src/lib/posts/chain";
import { FakeDynamicChain } from "src/lib/posts/chain/testing";
import { ChainTransactionError } from "src/lib/posts/chain/types";
import { applyConsumptionForCreditedCharge } from "src/lib/posts/dynamics/consumption";
import { participateInDynamic } from "src/lib/posts/dynamics/participate";

const NOW = new Date("2027-01-15T18:00:00.000Z");
const DYNAMIC_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ESTABLISHMENT = "11111111-1111-4111-8111-111111111111";
const USER_A = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const USER_B = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

let chain: FakeDynamicChain;

async function seed(over: Partial<Row> = {}): Promise<Row> {
  const row: Row = {
    dynamic_id: DYNAMIC_ID,
    post_id: "post-1",
    establishment_id: null,
    kind: "going",
    status: "active",
    config: { text: "Voy" },
    progress_count: 0,
    progress_amount: new Prisma.Decimal(0),
    goal_count: 3,
    starts_at: null,
    ends_at: null,
    closed_at: null,
    token: null,
    chain_status: "active",
    contract_id: null,
    deploy_tx_hash: null,
    ...over,
  };
  if (row.chain_status === "active" && !row.contract_id) {
    const deployed = await chain.deploy({
      dynamic_id: row.dynamic_id,
      kind: row.kind as never,
      config: row.config,
      goal_count: row.goal_count,
      starts_at: row.starts_at,
      ends_at: row.ends_at,
      establishment_id: row.establishment_id,
      token: row.token,
    });
    row.contract_id = deployed.value.contractId;
  }
  store.rows.set(row.dynamic_id, row);
  chain.calls.length = 0;
  return row;
}

function dbRow(): Row {
  return store.rows.get(DYNAMIC_ID) as Row;
}

function methods(): string[] {
  return chain.calls.map((call) => call.method);
}

beforeEach(() => {
  vi.clearAllMocks();
  store.rows.clear();
  store.parts.length = 0;
  store.jobs.length = 0;
  store.seq = 0;
  chain = new FakeDynamicChain();
  setDynamicChainForTests(chain);
  prismaMock.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
    fn(prismaMock)
  );
});

afterEach(() => {
  setDynamicChainForTests(null);
  vi.unstubAllEnvs();
});

describe("participation with the contract in charge (on)", () => {
  beforeEach(() => {
    vi.stubEnv("DYNAMICS_CHAIN_MODE", "on");
  });

  it("confirms on-chain first, then writes the participation and copies progress", async () => {
    await seed();

    const result = await participateInDynamic({
      dynamicId: DYNAMIC_ID,
      userId: USER_A,
      source: "going",
      now: NOW,
    });

    expect(result.ok).toBe(true);
    expect(methods()).toContain("participate");
    expect(store.parts).toHaveLength(1);
    expect(store.parts[0]).toMatchObject({
      user_id: USER_A,
      source: "going",
      person_key: USER_A,
      tx_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
    expect(dbRow().progress_count).toBe(1);
    if (result.ok) {
      expect(result.dynamic).toMatchObject({
        progress_count: 1,
        viewer_participated: true,
        chain_status: "active",
      });
    }
  });

  it("does not pay for a duplicate the database already knows", async () => {
    await seed();
    store.parts.push({
      participation_id: "p0",
      dynamic_id: DYNAMIC_ID,
      user_id: USER_A,
      source: "going",
      charge_id: null,
      person_key: USER_A,
      tx_hash: null,
    } satisfies Part);

    const result = await participateInDynamic({
      dynamicId: DYNAMIC_ID,
      userId: USER_A,
      source: "going",
      now: NOW,
    });

    expect(result).toMatchObject({ ok: false, code: "already_participated" });
    expect(methods()).toEqual([]);
  });

  it("writes nothing when Stellar is unavailable", async () => {
    await seed();
    chain.failWith("participate", new ChainTransactionError("RPC caído", true));

    const result = await participateInDynamic({
      dynamicId: DYNAMIC_ID,
      userId: USER_A,
      source: "going",
      now: NOW,
    });

    expect(result).toMatchObject({ ok: false, code: "chain_unavailable", status: 503 });
    expect(store.parts).toHaveLength(0);
    expect(dbRow().progress_count).toBe(0);
  });

  it("recovers a participation that confirmed on-chain but never reached the database", async () => {
    await seed();
    await chain.participate(dbRow().contract_id as string, USER_A);
    chain.calls.length = 0;

    const result = await participateInDynamic({
      dynamicId: DYNAMIC_ID,
      userId: USER_A,
      source: "going",
      now: NOW,
    });

    expect(result.ok).toBe(true);
    expect(store.parts).toHaveLength(1);
    // The contract counted it once; the mirror is corrected to that single count.
    expect(dbRow().progress_count).toBe(1);
  });

  it("closes the mirror when the participation reaches the goal", async () => {
    await seed({ goal_count: 1 });

    const first = await participateInDynamic({
      dynamicId: DYNAMIC_ID,
      userId: USER_A,
      source: "going",
      now: NOW,
    });
    expect(first.ok).toBe(true);
    expect(dbRow().status).toBe("exhausted");
    if (first.ok) expect(first.dynamic.phase).toBe("exhausted");

    chain.calls.length = 0;
    const second = await participateInDynamic({
      dynamicId: DYNAMIC_ID,
      userId: USER_B,
      source: "going",
      now: NOW,
    });
    expect(second).toMatchObject({ ok: false, code: "exhausted" });
    expect(methods()).toEqual([]);
  });

  it("learns about a close the mirror had missed from the contract's answer", async () => {
    await seed({ goal_count: 5 });
    await chain.close(dbRow().contract_id as string);
    chain.calls.length = 0;

    const result = await participateInDynamic({
      dynamicId: DYNAMIC_ID,
      userId: USER_A,
      source: "going",
      now: NOW,
    });

    expect(result).toMatchObject({ ok: false, code: "exhausted" });
    expect(store.parts).toHaveLength(0);
    expect(dbRow().status).toBe("exhausted");
  });

  it("validates the promo code against the mirror before spending fees", async () => {
    await seed({
      kind: "promo_code",
      config: { code: "CAFE26", benefit: "Café" },
      goal_count: 2,
    });

    const wrong = await participateInDynamic({
      dynamicId: DYNAMIC_ID,
      userId: USER_A,
      source: "promo_code",
      code: "nope",
      now: NOW,
    });
    expect(wrong).toMatchObject({ ok: false, code: "invalid_code" });
    expect(methods()).toEqual([]);

    const right = await participateInDynamic({
      dynamicId: DYNAMIC_ID,
      userId: USER_A,
      source: "promo_code",
      code: " cafe26 ",
      now: NOW,
    });
    expect(right.ok).toBe(true);
    expect(store.parts[0]).toMatchObject({ source: "promo_code" });
  });

  it("pauses participation while the contract is still deploying or failed", async () => {
    await seed({ chain_status: "pending" });
    const pending = await participateInDynamic({
      dynamicId: DYNAMIC_ID,
      userId: USER_A,
      source: "going",
      now: NOW,
    });
    expect(pending).toMatchObject({ ok: false, code: "chain_unavailable", status: 503 });

    dbRow().chain_status = "failed";
    const failed = await participateInDynamic({
      dynamicId: DYNAMIC_ID,
      userId: USER_A,
      source: "going",
      now: NOW,
    });
    expect(failed).toMatchObject({ ok: false, code: "chain_unavailable", status: 409 });
    expect(methods()).toEqual([]);
    expect(store.parts).toHaveLength(0);
  });

  it("keeps legacy dynamics on the database path", async () => {
    await seed({ chain_status: "legacy" });

    const result = await participateInDynamic({
      dynamicId: DYNAMIC_ID,
      userId: USER_A,
      source: "going",
      now: NOW,
    });

    expect(result.ok).toBe(true);
    expect(methods()).toEqual([]);
    expect(store.jobs).toEqual([]);
  });
});

describe("participation in shadow mode", () => {
  it("applies in the database and queues a copy for the contract", async () => {
    vi.stubEnv("DYNAMICS_CHAIN_MODE", "shadow");
    await seed();

    const result = await participateInDynamic({
      dynamicId: DYNAMIC_ID,
      userId: USER_A,
      source: "going",
      now: NOW,
    });

    expect(result.ok).toBe(true);
    expect(methods()).toEqual([]);
    expect(dbRow().progress_count).toBe(1);
    expect(store.jobs).toEqual([
      expect.objectContaining({
        type: "participation",
        dedupe_key: USER_A,
        dynamic_id: DYNAMIC_ID,
        payload: { user_id: USER_A },
      }),
    ]);
  });

  it("does not queue anything when the mode is off", async () => {
    await seed({ chain_status: "legacy" });
    await participateInDynamic({
      dynamicId: DYNAMIC_ID,
      userId: USER_A,
      source: "going",
      now: NOW,
    });
    expect(store.jobs).toEqual([]);
  });
});

describe("consumption", () => {
  const input = {
    chargeId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    establishmentId: ESTABLISHMENT,
    userId: USER_A,
    amount: "125.50",
    now: NOW,
  };

  function consumptionRow(over: Partial<Row> = {}) {
    return seed({
      kind: "consumption",
      establishment_id: ESTABLISHMENT,
      config: { goal_mode: "count", min_ticket: null, product_ids: [] },
      goal_count: 2,
      ...over,
    });
  }

  it("queues the charge instead of applying it when the contract is in charge", async () => {
    vi.stubEnv("DYNAMICS_CHAIN_MODE", "on");
    await consumptionRow();

    const result = await applyConsumptionForCreditedCharge(prismaMock as never, input);

    expect(result).toEqual({
      appliedDynamicIds: [],
      queuedDynamicIds: [DYNAMIC_ID],
    });
    expect(store.parts).toHaveLength(0);
    expect(dbRow().progress_count).toBe(0);
    expect(store.jobs).toEqual([
      expect.objectContaining({
        type: "consume",
        dedupe_key: input.chargeId,
        payload: {
          charge_id: input.chargeId,
          user_id: USER_A,
          amount_centavos: "12550",
        },
      }),
    ]);
  });

  it("waits for a contract that is still deploying and skips failed ones", async () => {
    vi.stubEnv("DYNAMICS_CHAIN_MODE", "on");
    await consumptionRow({ chain_status: "pending" });
    const pending = await applyConsumptionForCreditedCharge(prismaMock as never, input);
    expect(pending.queuedDynamicIds).toEqual([DYNAMIC_ID]);
    expect(pending.appliedDynamicIds).toEqual([]);

    store.jobs.length = 0;
    dbRow().chain_status = "failed";
    const failed = await applyConsumptionForCreditedCharge(prismaMock as never, input);
    expect(failed).toEqual({ appliedDynamicIds: [], queuedDynamicIds: [] });
    expect(store.jobs).toEqual([]);
  });

  it("does not queue a charge for a dynamic that already ended by time", async () => {
    vi.stubEnv("DYNAMICS_CHAIN_MODE", "on");
    await consumptionRow({ ends_at: new Date(NOW.getTime() - 1000) });
    const result = await applyConsumptionForCreditedCharge(prismaMock as never, input);
    expect(result.queuedDynamicIds).toEqual([]);
    expect(store.jobs).toEqual([]);
  });

  it("applies in the database and also queues a copy in shadow mode", async () => {
    vi.stubEnv("DYNAMICS_CHAIN_MODE", "shadow");
    await consumptionRow();

    const result = await applyConsumptionForCreditedCharge(prismaMock as never, input);

    expect(result.appliedDynamicIds).toEqual([DYNAMIC_ID]);
    expect(result.queuedDynamicIds).toEqual([DYNAMIC_ID]);
    expect(dbRow().progress_count).toBe(1);
    expect(store.parts[0]).toMatchObject({ source: "charge", charge_id: input.chargeId });
    expect(store.jobs).toHaveLength(1);
  });

  it("keeps legacy behavior when the mode is off", async () => {
    await consumptionRow({ chain_status: "legacy" });
    const result = await applyConsumptionForCreditedCharge(prismaMock as never, input);
    expect(result).toEqual({ appliedDynamicIds: [DYNAMIC_ID], queuedDynamicIds: [] });
    expect(store.jobs).toEqual([]);
  });
});
