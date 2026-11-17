import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Prisma } from "src/generated/prisma/client";

const prismaMock = vi.hoisted(() => ({
  postDynamic: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    updateMany: vi.fn(),
  },
  dynamicChainJob: {
    upsert: vi.fn(),
    updateMany: vi.fn(),
    findMany: vi.fn(),
  },
}));

const budgetMock = vi.hoisted(() => ({ getSignerBudget: vi.fn() }));

vi.mock("src/lib/db", () => ({ default: prismaMock }));
vi.mock("src/lib/posts/chain/budget", () => budgetMock);

import { setDynamicChainForTests } from "src/lib/posts/chain";
import { handleChainCron } from "src/lib/posts/chain/cron";
import { reconcileActiveDynamics } from "src/lib/posts/chain/reconcile";
import { FakeDynamicChain } from "src/lib/posts/chain/testing";
import {
  enqueueBumpJobs,
  enqueueEvaluateJobs,
  runChainWorker,
} from "src/lib/posts/chain/worker";

const NOW = new Date("2027-01-15T18:00:00.000Z");
const DYNAMIC_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SECRET = "cron-secret-with-at-least-24-chars";

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.postDynamic.updateMany.mockResolvedValue({ count: 1 });
  prismaMock.dynamicChainJob.upsert.mockResolvedValue({});
  prismaMock.dynamicChainJob.findMany.mockResolvedValue([]);
  prismaMock.dynamicChainJob.updateMany.mockResolvedValue({ count: 0 });
  budgetMock.getSignerBudget.mockResolvedValue({
    balanceXlm: 120,
    minBalanceXlm: 50,
    ok: true,
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  setDynamicChainForTests(null);
});

describe("maintenance sweeps", () => {
  it("asks the contract to evaluate dynamics whose time ran out, once per bucket", async () => {
    prismaMock.postDynamic.findMany.mockResolvedValue([
      { dynamic_id: DYNAMIC_ID, contract_id: "CONTRACT" },
    ]);

    const count = await enqueueEvaluateJobs(NOW);
    await enqueueEvaluateJobs(new Date(NOW.getTime() + 60_000));

    expect(count).toBe(1);
    const where = prismaMock.postDynamic.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ chain_status: "active", status: "active" });
    // 30s of grace so the ledger clock is never behind ends_at.
    expect(where.ends_at.lt).toEqual(new Date(NOW.getTime() - 30_000));

    const keys = prismaMock.dynamicChainJob.upsert.mock.calls.map(
      (call) => call[0].create.dedupe_key
    );
    expect(keys[0]).toMatch(/^eval:\d+$/);
    expect(keys[1]).toBe(keys[0]);
  });

  it("keeps live contracts alive with a bump per period", async () => {
    prismaMock.postDynamic.findMany.mockResolvedValue([
      { dynamic_id: DYNAMIC_ID, contract_id: "CONTRACT" },
    ]);

    await enqueueBumpJobs(NOW);

    expect(prismaMock.dynamicChainJob.upsert.mock.calls[0][0].create).toMatchObject({
      type: "bump",
      dynamic_id: DYNAMIC_ID,
      contract_id: "CONTRACT",
    });
  });
});

describe("runChainWorker", () => {
  it("does nothing while the mode is off", async () => {
    const report = await runChainWorker({ now: NOW });
    expect(report).toEqual({
      mode: "off",
      processed: [],
      enqueued: { evaluate: 0, bump: 0 },
    });
    expect(prismaMock.postDynamic.findMany).not.toHaveBeenCalled();
    expect(budgetMock.getSignerBudget).not.toHaveBeenCalled();
  });

  it("runs maintenance, reports the balance and survives an RPC failure", async () => {
    vi.stubEnv("DYNAMICS_CHAIN_MODE", "shadow");
    prismaMock.postDynamic.findMany.mockResolvedValue([]);

    const ok = await runChainWorker({ now: NOW, chain: new FakeDynamicChain() });
    expect(ok.balance).toEqual({ balanceXlm: 120, minBalanceXlm: 50, ok: true });

    budgetMock.getSignerBudget.mockRejectedValue(new Error("rpc down"));
    const failed = await runChainWorker({ now: NOW, chain: new FakeDynamicChain() });
    expect(failed.balance).toEqual({ error: "rpc down" });
  });

  it("logs when the signer balance is below the minimum", async () => {
    vi.stubEnv("DYNAMICS_CHAIN_MODE", "shadow");
    prismaMock.postDynamic.findMany.mockResolvedValue([]);
    budgetMock.getSignerBudget.mockResolvedValue({
      balanceXlm: 3,
      minBalanceXlm: 50,
      ok: false,
    });
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const report = await runChainWorker({ now: NOW, chain: new FakeDynamicChain() });

    expect(report.balance).toMatchObject({ ok: false });
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("saldo bajo"));
    spy.mockRestore();
  });
});

describe("reconcileActiveDynamics", () => {
  let chain: FakeDynamicChain;
  let contractId: string;

  function row(over: Record<string, unknown> = {}) {
    return {
      dynamic_id: DYNAMIC_ID,
      kind: "going",
      status: "active",
      progress_count: 0,
      progress_amount: new Prisma.Decimal(0),
      closed_at: null,
      chain_status: "active",
      contract_id: contractId,
      ...over,
    };
  }

  beforeEach(async () => {
    chain = new FakeDynamicChain();
    const deployed = await chain.deploy({
      dynamic_id: DYNAMIC_ID,
      kind: "going",
      config: { text: "Voy" },
      goal_count: 5,
      starts_at: null,
      ends_at: null,
      establishment_id: null,
      token: null,
    });
    contractId = deployed.value.contractId;
    await chain.participate(contractId, "user-1");
    await chain.participate(contractId, "user-2");
    prismaMock.postDynamic.findMany.mockResolvedValue([
      { dynamic_id: DYNAMIC_ID, contract_id: contractId },
    ]);
    prismaMock.postDynamic.findUnique.mockResolvedValue(row());
  });

  it("only reports divergence in shadow mode", async () => {
    vi.stubEnv("DYNAMICS_CHAIN_MODE", "shadow");

    const report = await reconcileActiveDynamics({ chain });

    expect(report).toMatchObject({ checked: 1, divergent: 1, corrected: 0, errors: 0 });
    expect(report.entries[0].diffs).toEqual([
      { field: "progress_count", database: "0", chain: "2" },
    ]);
    const writes = prismaMock.postDynamic.updateMany.mock.calls.filter(
      (call) => "progress_count" in call[0].data
    );
    expect(writes).toEqual([]);
  });

  it("rewrites the database from the contract in on mode", async () => {
    vi.stubEnv("DYNAMICS_CHAIN_MODE", "on");

    const report = await reconcileActiveDynamics({ chain });

    expect(report).toMatchObject({ checked: 1, divergent: 1, corrected: 1 });
    const write = prismaMock.postDynamic.updateMany.mock.calls.find(
      (call) => "progress_count" in call[0].data
    );
    expect(write?.[0].data).toMatchObject({ status: "active", progress_count: 2 });
  });

  it("stays quiet when both sides agree", async () => {
    vi.stubEnv("DYNAMICS_CHAIN_MODE", "on");
    prismaMock.postDynamic.findUnique.mockResolvedValue(row({ progress_count: 2 }));

    const report = await reconcileActiveDynamics({ chain });

    expect(report).toMatchObject({ checked: 1, divergent: 0, corrected: 0 });
    expect(report.entries).toEqual([]);
  });

  it("records an RPC error for one dynamic without stopping the sweep", async () => {
    vi.stubEnv("DYNAMICS_CHAIN_MODE", "on");
    vi.spyOn(chain, "readState").mockRejectedValue(new Error("rpc down"));

    const report = await reconcileActiveDynamics({ chain });

    expect(report).toMatchObject({ checked: 0, errors: 1 });
    expect(report.entries[0].error).toBe("rpc down");
  });
});

describe("handleChainCron", () => {
  function request(auth?: string, query = "") {
    return new Request(`https://tonki.test/api/internal/dynamics/chain${query}`, {
      headers: auth ? { authorization: auth } : {},
    });
  }

  it("stays closed when CRON_SECRET is missing or too short", async () => {
    expect((await handleChainCron(request(`Bearer ${SECRET}`))).status).toBe(503);
    vi.stubEnv("CRON_SECRET", "short");
    expect((await handleChainCron(request("Bearer short"))).status).toBe(503);
  });

  it("rejects missing and wrong credentials", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    expect((await handleChainCron(request())).status).toBe(401);
    expect((await handleChainCron(request("Bearer nope"))).status).toBe(401);
    expect((await handleChainCron(request(SECRET))).status).toBe(401);
    expect(prismaMock.dynamicChainJob.updateMany).not.toHaveBeenCalled();
  });

  it("runs the worker and can requeue failed jobs", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    vi.stubEnv("DYNAMICS_CHAIN_MODE", "shadow");
    setDynamicChainForTests(new FakeDynamicChain());
    prismaMock.postDynamic.findMany.mockResolvedValue([]);
    prismaMock.dynamicChainJob.updateMany.mockResolvedValue({ count: 2 });

    const response = await handleChainCron(request(`Bearer ${SECRET}`, "?retryFailed=1"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ ok: true, requeued: 2, mode: "shadow" });
    expect(prismaMock.dynamicChainJob.updateMany.mock.calls[0][0].where.status).toBe(
      "failed"
    );
  });

  it("does not leak details when the worker throws", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    vi.stubEnv("DYNAMICS_CHAIN_MODE", "shadow");
    prismaMock.postDynamic.findMany.mockRejectedValue(new Error("db password leaked"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await handleChainCron(request(`Bearer ${SECRET}`));

    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("leaked");
    spy.mockRestore();
  });
});
