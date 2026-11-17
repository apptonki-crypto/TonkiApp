import { Keypair } from "@stellar/stellar-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Prisma } from "src/generated/prisma/client";

const prismaMock = vi.hoisted(() => ({
  postDynamic: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    updateMany: vi.fn(),
  },
  postDynamicParticipation: {
    updateMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  dynamicChainJob: {
    update: vi.fn(),
    updateMany: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    upsert: vi.fn(),
  },
}));

vi.mock("src/lib/db", () => ({ default: prismaMock }));

import { configHash } from "src/lib/posts/chain/hashes";
import type { ClaimedJob } from "src/lib/posts/chain/jobs";
import { FakeDynamicChain } from "src/lib/posts/chain/testing";
import { ChainTransactionError } from "src/lib/posts/chain/types";
import { runChainJob } from "src/lib/posts/chain/worker";

const NOW = new Date("2026-11-11T18:00:00.000Z");
const DYNAMIC_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const HASH_SECRET = "s".repeat(32);

function stubChainEnv(mode: "shadow" | "on") {
  vi.stubEnv("DYNAMICS_CHAIN_MODE", mode);
  vi.stubEnv("DYNAMIC_WASM_HASH", "a".repeat(64));
  vi.stubEnv("STELLAR_DEPLOYER_SECRET_KEY", Keypair.random().secret());
  vi.stubEnv("DYNAMICS_HASH_SECRET", HASH_SECRET);
}

const goingRow = {
  dynamic_id: DYNAMIC_ID,
  kind: "going",
  status: "active",
  config: { text: "Voy" },
  goal_count: 3,
  starts_at: null,
  ends_at: null,
  establishment_id: null,
  token: null,
  chain_status: "pending",
  contract_id: null,
  config_hash: null,
};

function rowHash(row = goingRow): string {
  return configHash(
    {
      dynamic_id: row.dynamic_id,
      kind: "going",
      config: row.config,
      goal_count: row.goal_count,
      starts_at: row.starts_at,
      ends_at: row.ends_at,
      establishment_id: row.establishment_id,
      token: row.token,
    },
    HASH_SECRET
  ).toString("hex");
}

function job(over: Partial<ClaimedJob> = {}): ClaimedJob {
  return {
    job_id: "job-1",
    dynamic_id: DYNAMIC_ID,
    contract_id: null,
    type: "deploy",
    dedupe_key: "k",
    payload: { config_hash: rowHash() },
    attempts: 1,
    ...over,
  };
}

describe("runChainJob deploy", () => {
  let chain: FakeDynamicChain;

  beforeEach(() => {
    vi.clearAllMocks();
    stubChainEnv("shadow");
    chain = new FakeDynamicChain();
    prismaMock.postDynamic.findUnique.mockResolvedValue(goingRow);
    prismaMock.postDynamic.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.dynamicChainJob.update.mockResolvedValue({});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("deploys, activates the dynamic and records the transaction and fee", async () => {
    const result = await runChainJob(job(), chain, NOW);

    expect(result.result).toBe("done");
    expect(chain.calls.map((call) => call.method)).toEqual(["deploy"]);
    const [contractId] = [...chain.contracts.keys()];
    expect(prismaMock.postDynamic.updateMany).toHaveBeenCalledWith({
      where: {
        dynamic_id: DYNAMIC_ID,
        chain_status: "pending",
        config_hash: rowHash(),
      },
      data: expect.objectContaining({
        contract_id: contractId,
        chain_status: "active",
        deploy_tx_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
      }),
    });
    expect(prismaMock.dynamicChainJob.update).toHaveBeenCalledWith({
      where: { job_id: "job-1" },
      data: expect.objectContaining({
        status: "done",
        fee_stroops: BigInt(100_000),
      }),
    });
  });

  it("skips a deploy that an edit already superseded", async () => {
    const result = await runChainJob(
      job({ payload: { config_hash: "f".repeat(64) } }),
      chain,
      NOW
    );
    expect(result.result).toBe("done");
    expect(chain.calls).toEqual([]);
    expect(prismaMock.dynamicChainJob.update.mock.calls[0][0].data.last_error).toBe(
      "superseded"
    );
  });

  it("does nothing when the dynamic was deleted or is not pending", async () => {
    prismaMock.postDynamic.findUnique.mockResolvedValueOnce(null);
    expect((await runChainJob(job(), chain, NOW)).result).toBe("done");
    prismaMock.postDynamic.findUnique.mockResolvedValueOnce({
      ...goingRow,
      chain_status: "active",
    });
    expect((await runChainJob(job(), chain, NOW)).result).toBe("done");
    expect(chain.calls).toEqual([]);
  });

  it("retries transient failures with backoff and keeps the dynamic pending", async () => {
    chain.failWith("deploy", new ChainTransactionError("RPC caído", true));
    const result = await runChainJob(job({ attempts: 2 }), chain, NOW);

    expect(result).toMatchObject({ result: "retry", error: "RPC caído" });
    const data = prismaMock.dynamicChainJob.update.mock.calls[0][0].data;
    expect(data.status).toBe("pending");
    expect(data.next_attempt_at.getTime()).toBe(NOW.getTime() + 30_000);
    expect(prismaMock.postDynamic.updateMany).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: { chain_status: "failed" } })
    );
  });

  it("marks the dynamic as failed when the contract rejects the deploy", async () => {
    chain.failWith("deploy", new ChainTransactionError("Config inválida", false));
    const result = await runChainJob(job(), chain, NOW);

    expect(result.result).toBe("failed");
    expect(prismaMock.dynamicChainJob.update.mock.calls[0][0].data.status).toBe("failed");
    expect(prismaMock.postDynamic.updateMany).toHaveBeenCalledWith({
      where: { dynamic_id: DYNAMIC_ID, chain_status: "pending" },
      data: { chain_status: "failed" },
    });
  });

  it("gives up after the maximum number of attempts", async () => {
    chain.failWith("deploy", new ChainTransactionError("RPC caído", true));
    const result = await runChainJob(job({ attempts: 8 }), chain, NOW);
    expect(result.result).toBe("failed");
    expect(prismaMock.postDynamic.updateMany).toHaveBeenCalledWith({
      where: { dynamic_id: DYNAMIC_ID, chain_status: "pending" },
      data: { chain_status: "failed" },
    });
  });
});

describe("runChainJob close and sync", () => {
  let chain: FakeDynamicChain;

  beforeEach(() => {
    vi.clearAllMocks();
    chain = new FakeDynamicChain();
    prismaMock.dynamicChainJob.update.mockResolvedValue({});
    prismaMock.postDynamic.updateMany.mockResolvedValue({ count: 1 });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  async function seedContract(): Promise<string> {
    const deployed = await chain.deploy({
      dynamic_id: DYNAMIC_ID,
      kind: "going",
      config: { text: "Voy" },
      goal_count: 3,
      starts_at: null,
      ends_at: null,
      establishment_id: null,
      token: null,
    });
    return deployed.value.contractId;
  }

  function mirrorRow(contractId: string, over: Record<string, unknown> = {}) {
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

  it("force-closes and rewrites the mirror from the contract in on mode", async () => {
    stubChainEnv("on");
    const contractId = await seedContract();
    prismaMock.postDynamic.findUnique.mockResolvedValue(mirrorRow(contractId));

    const result = await runChainJob(
      job({ type: "close", contract_id: contractId, payload: { force: true } }),
      chain,
      NOW
    );

    expect(result.result).toBe("done");
    expect(chain.contracts.get(contractId)?.status).toBe("exhausted");
    const write = prismaMock.postDynamic.updateMany.mock.calls.find(
      (call) => call[0].data.status === "exhausted"
    );
    expect(write?.[0].data).toMatchObject({
      status: "exhausted",
      progress_count: 0,
      closed_at: new Date(1_800_000_000 * 1000),
    });
  });

  it("only reports the difference in shadow mode", async () => {
    stubChainEnv("shadow");
    const contractId = await seedContract();
    prismaMock.postDynamic.findUnique.mockResolvedValue(mirrorRow(contractId));

    const result = await runChainJob(
      job({ type: "evaluate", contract_id: contractId, payload: null }),
      chain,
      NOW
    );

    expect(result.result).toBe("done");
    // evaluate does not close an active going dynamic, so there is nothing to report.
    expect(prismaMock.postDynamic.updateMany.mock.calls.some((c) => c[0].data.status)).toBe(
      false
    );

    await chain.close(contractId);
    await runChainJob(
      job({ type: "evaluate", contract_id: contractId, payload: null }),
      chain,
      NOW
    );
    expect(prismaMock.dynamicChainJob.update.mock.calls.at(-1)?.[0].data.last_error).toBe(
      "divergence:status"
    );
    expect(prismaMock.postDynamic.updateMany.mock.calls.some((c) => c[0].data.status)).toBe(
      false
    );
  });

  it("does not touch the mirror when the dynamic moved to a newer contract", async () => {
    stubChainEnv("on");
    const contractId = await seedContract();
    prismaMock.postDynamic.findUnique.mockResolvedValue(
      mirrorRow("C".padEnd(56, "Z"))
    );

    await runChainJob(
      job({ type: "close", contract_id: contractId, payload: { force: true } }),
      chain,
      NOW
    );

    expect(prismaMock.postDynamic.updateMany).not.toHaveBeenCalled();
  });
});
