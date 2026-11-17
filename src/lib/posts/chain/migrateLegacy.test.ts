import { Keypair } from "@stellar/stellar-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Prisma } from "src/generated/prisma/client";

type Row = Record<string, unknown> & {
  dynamic_id: string;
  kind: string;
  status: string;
  chain_status: string;
  contract_id: string | null;
  progress_count: number;
};
type Part = {
  participation_id: string;
  dynamic_id: string;
  user_id: string;
  charge_id: string | null;
  charge: { amount: Prisma.Decimal } | null;
  created_at: Date;
};

const store = vi.hoisted(() => ({
  rows: new Map<string, unknown>(),
  parts: [] as unknown[],
  jobs: [] as Array<Record<string, unknown>>,
}));

const prismaMock = vi.hoisted(() => ({
  postDynamic: {
    findMany: vi.fn(
      async ({
        where,
        take,
      }: {
        where: { dynamic_id?: string; kind?: { in: string[] } };
        take?: number;
      }) => {
        const rows = [...store.rows.values()] as Row[];
        return rows
          .filter(
            (r) =>
              (!where.dynamic_id || r.dynamic_id === where.dynamic_id) &&
              (!where.kind || where.kind.in.includes(r.kind)) &&
              (r.chain_status === "legacy" ||
                (r.chain_status === "pending" && r.contract_id !== null))
          )
          .slice(0, take)
          .map((r) => ({ ...r }));
      }
    ),
    findUnique: vi.fn(async ({ where }: { where: { dynamic_id: string } }) => {
      const row = store.rows.get(where.dynamic_id);
      return row ? { ...(row as object) } : null;
    }),
    updateMany: vi.fn(
      async ({
        where,
        data,
      }: {
        where: {
          dynamic_id: string;
          chain_status?: string;
          contract_id?: string;
          OR?: Array<{ chain_status: string; contract_id?: unknown }>;
        };
        data: Record<string, unknown>;
      }) => {
        const row = store.rows.get(where.dynamic_id) as Row | undefined;
        if (!row) return { count: 0 };
        if (where.chain_status && row.chain_status !== where.chain_status) return { count: 0 };
        if (where.contract_id && row.contract_id !== where.contract_id) return { count: 0 };
        if (
          where.OR &&
          !where.OR.some(
            (c) =>
              c.chain_status === row.chain_status &&
              (c.contract_id === undefined || row.contract_id !== null)
          )
        ) {
          return { count: 0 };
        }
        Object.assign(row, data);
        return { count: 1 };
      }
    ),
  },
  postDynamicParticipation: {
    findMany: vi.fn(async ({ where }: { where: { dynamic_id: string } }) =>
      (store.parts as Part[]).filter((p) => p.dynamic_id === where.dynamic_id)
    ),
  },
  dynamicChainJob: {
    upsert: vi.fn(async ({ create }: { create: Record<string, unknown> }) => {
      store.jobs.push(create);
      return create;
    }),
  },
}));

vi.mock("src/lib/db", () => ({ default: prismaMock }));

import { setDynamicChainForTests } from "src/lib/posts/chain";
import { migrateLegacyDynamics } from "src/lib/posts/chain/migrateLegacy";
import { FakeDynamicChain } from "src/lib/posts/chain/testing";
import { ChainTransactionError } from "src/lib/posts/chain/types";

const NOW = new Date("2027-01-15T18:00:00.000Z");
const ESTABLISHMENT = "11111111-1111-4111-8111-111111111111";
let chain: FakeDynamicChain;
let seq = 0;

function stubChainEnv(mode: "shadow" | "on" = "shadow") {
  vi.stubEnv("DYNAMICS_CHAIN_MODE", mode);
  vi.stubEnv("DYNAMIC_WASM_HASH", "a".repeat(64));
  vi.stubEnv("STELLAR_DEPLOYER_SECRET_KEY", Keypair.random().secret());
  vi.stubEnv("DYNAMICS_HASH_SECRET", "s".repeat(32));
}

function id(prefix: string, n: number) {
  return `${prefix.repeat(8)}-${prefix.repeat(4)}-4${prefix.repeat(3)}-8${prefix.repeat(3)}-${String(n).padStart(12, "0")}`;
}

function addDynamic(over: Partial<Row> = {}): Row {
  seq += 1;
  const row: Row = {
    dynamic_id: id("a", seq),
    kind: "going",
    status: "active",
    config: { text: "Voy" },
    goal_count: 50,
    starts_at: null,
    ends_at: null,
    establishment_id: null,
    token: null,
    progress_count: 0,
    progress_amount: new Prisma.Decimal(0),
    closed_at: null,
    chain_status: "legacy",
    contract_id: null,
    ...over,
  };
  store.rows.set(row.dynamic_id, row);
  return row;
}

function addParticipant(dynamicId: string, userNumber: number) {
  store.parts.push({
    participation_id: `p-${store.parts.length}`,
    dynamic_id: dynamicId,
    user_id: id("b", userNumber),
    charge_id: null,
    charge: null,
    created_at: new Date(NOW.getTime() + store.parts.length),
  } satisfies Part);
}

function addCharge(dynamicId: string, chargeNumber: number, amount: string) {
  store.parts.push({
    participation_id: `p-${store.parts.length}`,
    dynamic_id: dynamicId,
    user_id: id("b", 1),
    charge_id: id("c", chargeNumber),
    charge: { amount: new Prisma.Decimal(amount) },
    created_at: new Date(NOW.getTime() + store.parts.length),
  } satisfies Part);
}

function importCalls() {
  return chain.calls.filter((c) => c.method === "importBatch");
}

beforeEach(() => {
  vi.clearAllMocks();
  store.rows.clear();
  store.parts.length = 0;
  store.jobs.length = 0;
  seq = 0;
  chain = new FakeDynamicChain();
  setDynamicChainForTests(chain);
  stubChainEnv();
});

afterEach(() => {
  setDynamicChainForTests(null);
  vi.unstubAllEnvs();
});

describe("migrateLegacyDynamics", () => {
  it("refuses to run while the mode is off", async () => {
    vi.stubEnv("DYNAMICS_CHAIN_MODE", "off");
    await expect(migrateLegacyDynamics({ dryRun: false, now: NOW })).rejects.toThrow(/off/);
  });

  it("is a dry run by default and writes nothing", async () => {
    const row = addDynamic({ progress_count: 5 });
    addParticipant(row.dynamic_id, 1);
    addParticipant(row.dynamic_id, 2);

    const report = await migrateLegacyDynamics({ now: NOW });

    expect(report).toMatchObject({ dryRun: true, candidates: 1, migrated: 0, failed: 0 });
    expect(report.entries[0]).toMatchObject({
      action: "would_migrate",
      participants: 2,
      charges: 0,
    });
    // The stored counter says 5 but only two rows exist: worth knowing before importing.
    expect(report.entries[0].progress_warning).toContain("progress_count=5");
    expect(prismaMock.postDynamic.updateMany).not.toHaveBeenCalled();
    expect(chain.calls).toEqual([]);
    expect(row.chain_status).toBe("legacy");
  });

  it("deploys, imports in batches and activates with matching counts", async () => {
    const row = addDynamic({ progress_count: 5 });
    for (let n = 1; n <= 5; n += 1) addParticipant(row.dynamic_id, n);

    const report = await migrateLegacyDynamics({ dryRun: false, batchSize: 2, now: NOW });

    expect(report).toMatchObject({ migrated: 1, failed: 0 });
    expect(importCalls()).toHaveLength(3);
    const contractId = report.entries[0].contract_id as string;
    expect(row).toMatchObject({ chain_status: "active", contract_id: contractId });
    expect(row.config_hash).toMatch(/^[0-9a-f]{64}$/);

    const state = await chain.readState(contractId);
    expect(state.progressCount).toBe(5);
    expect(state.status).toBe("active");
    expect(store.jobs[0]).toMatchObject({ type: "deploy", status: "done", last_error: "migration" });
  });

  it("imports charges with their amounts in centavos", async () => {
    const row = addDynamic({
      kind: "consumption",
      establishment_id: ESTABLISHMENT,
      config: { goal_mode: "amount", goal_amount: "1000", min_ticket: null, product_ids: [] },
      goal_count: null,
    });
    addCharge(row.dynamic_id, 1, "125.50");
    addCharge(row.dynamic_id, 2, "74.50");

    const report = await migrateLegacyDynamics({ dryRun: false, now: NOW });

    expect(report.migrated).toBe(1);
    expect(report.entries[0]).toMatchObject({ charges: 2, amount_centavos: "20000" });
    const state = await chain.readState(report.entries[0].contract_id as string);
    expect(state).toMatchObject({ progressCount: 2, progressAmount: BigInt(20000) });
  });

  it("skips dynamics that are about to close and leaves them untouched", async () => {
    const ended = addDynamic({ ends_at: new Date(NOW.getTime() - 1000) });
    const full = addDynamic({ goal_count: 2, progress_count: 2 });
    const closed = addDynamic({ status: "exhausted" });
    addDynamic({ chain_status: "active", contract_id: "C".padEnd(56, "A") });

    const report = await migrateLegacyDynamics({ dryRun: false, now: NOW });

    const reasons = Object.fromEntries(report.entries.map((e) => [e.dynamic_id, e.reason]));
    expect(reasons[ended.dynamic_id]).toBe("ended_pending_close");
    expect(reasons[full.dynamic_id]).toBe("goal_reached_pending_close");
    expect(reasons[closed.dynamic_id]).toBe("not_active");
    expect(report).toMatchObject({ candidates: 3, migrated: 0, skipped: 3 });
    expect(ended.chain_status).toBe("legacy");
    expect(chain.calls).toEqual([]);
  });

  it("only touches kinds enabled for the rollout", async () => {
    vi.stubEnv("DYNAMICS_CHAIN_KINDS", "going");
    addDynamic({ kind: "going" });
    const qr = addDynamic({ kind: "qr", config: { text: "x" } });

    const report = await migrateLegacyDynamics({ dryRun: false, now: NOW });

    expect(report.candidates).toBe(1);
    expect(qr.chain_status).toBe("legacy");
  });

  it("releases the claim when the import fails, and a rerun finishes the job", async () => {
    const row = addDynamic();
    addParticipant(row.dynamic_id, 1);
    const spy = vi
      .spyOn(chain, "importBatch")
      .mockRejectedValueOnce(new ChainTransactionError("RPC caído", true));

    const failed = await migrateLegacyDynamics({ dryRun: false, now: NOW });

    expect(failed).toMatchObject({ migrated: 0, failed: 1 });
    expect(failed.entries[0].reason).toBe("RPC caído");
    expect(row).toMatchObject({ chain_status: "legacy", contract_id: null, config_hash: null });

    spy.mockRestore();
    const retried = await migrateLegacyDynamics({ dryRun: false, now: NOW });
    expect(retried.migrated).toBe(1);
    expect(row.chain_status).toBe("active");
  });

  it("resumes a migration that was interrupted while pending", async () => {
    const row = addDynamic({ chain_status: "pending", contract_id: "C".padEnd(56, "A") });
    addParticipant(row.dynamic_id, 1);

    const report = await migrateLegacyDynamics({ dryRun: false, now: NOW });

    expect(report.migrated).toBe(1);
    // The address is derived from the config, not trusted from the leftover row.
    expect(row.contract_id).toBe(report.entries[0].contract_id);
    expect(row.chain_status).toBe("active");
  });

  it("does not take over a dynamic the deploy worker is still handling", async () => {
    addDynamic({ chain_status: "pending", contract_id: null });
    const report = await migrateLegacyDynamics({ dryRun: false, now: NOW });
    expect(report.candidates).toBe(0);
  });

  it("picks up participations that arrive while it imports", async () => {
    const row = addDynamic();
    addParticipant(row.dynamic_id, 1);
    const original = chain.importBatch.bind(chain);
    let injected = false;
    vi.spyOn(chain, "importBatch").mockImplementation(async (contractId, input) => {
      const result = await original(contractId, input);
      if (!injected) {
        injected = true;
        addParticipant(row.dynamic_id, 2);
      }
      return result;
    });

    const report = await migrateLegacyDynamics({ dryRun: false, now: NOW });

    expect(report.migrated).toBe(1);
    expect(report.entries[0].participants).toBe(2);
    const state = await chain.readState(report.entries[0].contract_id as string);
    expect(state.progressCount).toBe(2);
  });

  it("gives up and restores legacy when the contract never matches", async () => {
    const row = addDynamic();
    addParticipant(row.dynamic_id, 1);
    vi.spyOn(chain, "readState").mockResolvedValue({
      status: "active",
      progressCount: 99,
      progressAmount: BigInt(0),
    } as never);

    const report = await migrateLegacyDynamics({ dryRun: false, now: NOW });

    expect(report).toMatchObject({ migrated: 0, failed: 1 });
    expect(report.entries[0].reason).toMatch(/no coincide/);
    expect(row.chain_status).toBe("legacy");
  });
});
