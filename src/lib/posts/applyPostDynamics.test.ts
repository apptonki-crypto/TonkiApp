import { Keypair } from "@stellar/stellar-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  isDynamicClaimToken,
  parseCreateDynamicsField,
} from "src/lib/posts/dynamicRequests";

const prismaMock = vi.hoisted(() => {
  const postDynamic = {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    delete: vi.fn(),
  };
  const postDynamicParticipation = { count: vi.fn() };
  const dynamicChainJob = { upsert: vi.fn() };
  const queryRaw = vi.fn();
  const tx = {
    postDynamic,
    postDynamicParticipation,
    dynamicChainJob,
    $queryRaw: queryRaw,
  };
  return {
    postDynamic,
    postDynamicParticipation,
    dynamicChainJob,
    $queryRaw: queryRaw,
    $transaction: vi.fn(async (fn: (client: typeof tx) => Promise<void>) => fn(tx)),
  };
});

vi.mock("src/lib/db", () => ({
  default: prismaMock,
}));

import {
  applyDynamicPatch,
  createPostDynamics,
} from "src/lib/posts/applyPostDynamics";
import { PostDynamicRequestError } from "src/lib/posts/dynamicRequests";

const NOW = new Date("2026-10-26T18:00:00.000Z");
const POST_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const GOING_ID = "33333333-3333-4333-8333-333333333333";
const QR_ID = "44444444-4444-4444-8444-444444444444";
const ESTABLISHMENT = "11111111-1111-4111-8111-111111111111";
const QR_TOKEN = "qrTokenValue_123456";

function parsedCreate(raw: unknown) {
  const parsed = parseCreateDynamicsField(raw, ESTABLISHMENT);
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.data;
}

describe("createPostDynamics", () => {
  it("stores a QR token and the author establishment", async () => {
    const creates: Array<Record<string, unknown>> = [];
    const tx = {
      postDynamic: {
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          creates.push(data);
          return data;
        }),
      },
    };
    const inputs = parsedCreate([
      { kind: "going", text: "Voy" },
      { kind: "qr", text: "Escanea", goal_count: 2 },
      {
        kind: "consumption",
        establishment_id: "22222222-2222-4222-8222-222222222222",
        goal_mode: "count",
        goal_count: 1,
      },
    ]);

    await createPostDynamics(tx as never, POST_ID, inputs, NOW);

    expect(creates.map((row) => row.kind)).toEqual(["going", "qr", "consumption"]);
    expect(creates[0]).toMatchObject({
      post_id: POST_ID,
      token: null,
      establishment_id: null,
      status: "active",
    });
    expect(creates[1]?.token).toEqual(expect.any(String));
    expect(isDynamicClaimToken(String(creates[1]?.token))).toBe(true);
    expect(creates[2]).toMatchObject({ establishment_id: ESTABLISHMENT });
    expect(creates.map((row) => (row.created_at as Date).getTime())).toEqual([
      NOW.getTime(),
      NOW.getTime() + 1,
      NOW.getTime() + 2,
    ]);
  });
});

describe("applyDynamicPatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$queryRaw.mockResolvedValue([{ dynamic_id: GOING_ID }]);
    prismaMock.postDynamicParticipation.count.mockResolvedValue(0);
    prismaMock.postDynamic.count.mockResolvedValue(1);
    prismaMock.postDynamic.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.postDynamic.create.mockResolvedValue({});
    prismaMock.postDynamic.update.mockResolvedValue({});
    prismaMock.postDynamic.delete.mockResolvedValue({});
  });

  it("closes an active dynamic and creates a QR with its own token", async () => {
    prismaMock.postDynamic.findMany.mockResolvedValue([
      {
        dynamic_id: GOING_ID,
        kind: "going",
        status: "active",
        establishment_id: null,
        token: null,
        _count: { participations: 0 },
      },
    ]);
    const [qr] = parsedCreate([{ kind: "qr", text: "Escanea", goal_count: 3 }]);

    await applyDynamicPatch({
      postId: POST_ID,
      now: NOW,
      patch: {
        upserts: [{ input: qr }],
        close_ids: [GOING_ID],
        remove_ids: [],
      },
    });

    expect(prismaMock.postDynamic.updateMany).toHaveBeenCalledWith({
      where: {
        dynamic_id: GOING_ID,
        post_id: POST_ID,
        status: "active",
      },
      data: { status: "exhausted", closed_at: NOW },
    });
    const created = prismaMock.postDynamic.create.mock.calls[0][0].data;
    expect(created.kind).toBe("qr");
    expect(created.post_id).toBe(POST_ID);
    expect(created.token).toEqual(expect.any(String));
    expect(created.token).not.toBeNull();
  });

  it("keeps the existing QR token when the config is replaced", async () => {
    prismaMock.postDynamic.findMany.mockResolvedValue([
      {
        dynamic_id: QR_ID,
        kind: "qr",
        status: "active",
        establishment_id: null,
        token: QR_TOKEN,
        _count: { participations: 0 },
      },
    ]);
    prismaMock.postDynamic.findUnique.mockResolvedValue({
      kind: "qr",
      status: "active",
      token: QR_TOKEN,
    });
    const [qr] = parsedCreate([
      { kind: "qr", text: "Texto nuevo", goal_count: 6 },
    ]);

    await applyDynamicPatch({
      postId: POST_ID,
      now: NOW,
      patch: {
        upserts: [{ dynamic_id: QR_ID, input: qr }],
        close_ids: [],
        remove_ids: [],
      },
    });

    expect(prismaMock.postDynamic.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { dynamic_id: QR_ID },
        data: expect.objectContaining({
          token: QR_TOKEN,
          progress_count: 0,
          closed_at: null,
          status: "active",
          goal_count: 6,
        }),
      })
    );
  });

  it("refuses to delete when a participation arrives before the write", async () => {
    prismaMock.postDynamic.findMany.mockResolvedValue([
      {
        dynamic_id: GOING_ID,
        kind: "going",
        status: "active",
        establishment_id: null,
        token: null,
        _count: { participations: 0 },
      },
    ]);
    prismaMock.postDynamicParticipation.count.mockResolvedValue(1);

    await expect(
      applyDynamicPatch({
        postId: POST_ID,
        now: NOW,
        patch: {
          upserts: [],
          close_ids: [],
          remove_ids: [GOING_ID],
        },
      })
    ).rejects.toBeInstanceOf(PostDynamicRequestError);

    await expect(
      applyDynamicPatch({
        postId: POST_ID,
        now: NOW,
        patch: {
          upserts: [],
          close_ids: [],
          remove_ids: [GOING_ID],
        },
      })
    ).rejects.toMatchObject({ status: 409 });
    expect(prismaMock.postDynamic.delete).not.toHaveBeenCalled();
  });
});

function stubChainEnv(mode: "shadow" | "on" = "shadow", kinds = "all") {
  vi.stubEnv("DYNAMICS_CHAIN_MODE", mode);
  vi.stubEnv("DYNAMICS_CHAIN_KINDS", kinds);
  vi.stubEnv("DYNAMIC_WASM_HASH", "a".repeat(64));
  vi.stubEnv("STELLAR_DEPLOYER_SECRET_KEY", Keypair.random().secret());
  vi.stubEnv("DYNAMICS_HASH_SECRET", "s".repeat(32));
}

function upsertedJobs() {
  return prismaMock.dynamicChainJob.upsert.mock.calls.map(
    (call) => call[0].create as Record<string, unknown>
  );
}

describe("chain-aware dynamics", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$queryRaw.mockResolvedValue([{ dynamic_id: GOING_ID }]);
    prismaMock.postDynamicParticipation.count.mockResolvedValue(0);
    prismaMock.postDynamic.count.mockResolvedValue(1);
    prismaMock.postDynamic.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.postDynamic.create.mockResolvedValue({});
    prismaMock.postDynamic.update.mockResolvedValue({});
    prismaMock.postDynamic.delete.mockResolvedValue({});
    prismaMock.dynamicChainJob.upsert.mockResolvedValue({});
  });

  it("creates dynamics as pending and queues one deploy each when the chain is on", async () => {
    stubChainEnv("shadow");
    const creates: Array<Record<string, unknown>> = [];
    const tx = {
      postDynamic: {
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          creates.push(data);
        }),
      },
      dynamicChainJob: prismaMock.dynamicChainJob,
    };

    await createPostDynamics(
      tx as never,
      POST_ID,
      parsedCreate([
        { kind: "going", text: "Voy" },
        { kind: "qr", text: "Escanea", goal_count: 2 },
      ]),
      NOW
    );

    expect(creates.map((row) => row.chain_status)).toEqual(["pending", "pending"]);
    for (const row of creates) {
      expect(row.config_hash).toMatch(/^[0-9a-f]{64}$/);
      expect(row.dynamic_id).toEqual(expect.any(String));
    }
    const jobs = upsertedJobs();
    expect(jobs.map((job) => job.type)).toEqual(["deploy", "deploy"]);
    expect(jobs.map((job) => job.dynamic_id)).toEqual(creates.map((row) => row.dynamic_id));
    expect(jobs[0].dedupe_key).toBe(creates[0].config_hash);
  });

  it("only deploys the kinds enabled for the rollout", async () => {
    stubChainEnv("shadow", "going");
    const creates: Array<Record<string, unknown>> = [];
    const tx = {
      postDynamic: {
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          creates.push(data);
        }),
      },
      dynamicChainJob: prismaMock.dynamicChainJob,
    };

    await createPostDynamics(
      tx as never,
      POST_ID,
      parsedCreate([
        { kind: "going", text: "Voy" },
        { kind: "qr", text: "Escanea", goal_count: 2 },
      ]),
      NOW
    );

    expect(creates[0].chain_status).toBe("pending");
    expect(creates[1]).not.toHaveProperty("chain_status");
    expect(upsertedJobs()).toHaveLength(1);
  });

  it("falls back to the database in shadow mode when the chain is not configured", async () => {
    vi.stubEnv("DYNAMICS_CHAIN_MODE", "shadow");
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const create = vi.fn();
    await createPostDynamics(
      { postDynamic: { create }, dynamicChainJob: prismaMock.dynamicChainJob } as never,
      POST_ID,
      parsedCreate([{ kind: "going", text: "Voy" }]),
      NOW
    );
    expect(create.mock.calls[0][0].data).not.toHaveProperty("chain_status");
    expect(prismaMock.dynamicChainJob.upsert).not.toHaveBeenCalled();
  });

  it("refuses to create dynamics in on mode when the chain is not configured", async () => {
    vi.stubEnv("DYNAMICS_CHAIN_MODE", "on");
    const create = vi.fn();
    await expect(
      createPostDynamics(
        { postDynamic: { create }, dynamicChainJob: prismaMock.dynamicChainJob } as never,
        POST_ID,
        parsedCreate([{ kind: "going", text: "Voy" }]),
        NOW
      )
    ).rejects.toMatchObject({ status: 503 });
    expect(create).not.toHaveBeenCalled();
  });

  it("replaces the contract when an edited dynamic had one", async () => {
    stubChainEnv("shadow");
    const CONTRACT = "C".padEnd(56, "A");
    prismaMock.postDynamic.findMany.mockResolvedValue([
      {
        dynamic_id: QR_ID,
        kind: "qr",
        status: "active",
        establishment_id: null,
        token: QR_TOKEN,
        _count: { participations: 0 },
      },
    ]);
    prismaMock.postDynamic.findUnique.mockResolvedValue({
      kind: "qr",
      status: "active",
      token: QR_TOKEN,
      contract_id: CONTRACT,
    });
    const [qr] = parsedCreate([{ kind: "qr", text: "Texto nuevo", goal_count: 6 }]);

    await applyDynamicPatch({
      postId: POST_ID,
      now: NOW,
      patch: { upserts: [{ dynamic_id: QR_ID, input: qr }], close_ids: [], remove_ids: [] },
    });

    const data = prismaMock.postDynamic.update.mock.calls[0][0].data;
    expect(data).toMatchObject({
      contract_id: null,
      deploy_tx_hash: null,
      chain_status: "pending",
      token: QR_TOKEN,
    });
    expect(data.config_hash).toMatch(/^[0-9a-f]{64}$/);
    const jobs = upsertedJobs();
    expect(jobs.map((job) => job.type)).toEqual(["close", "deploy"]);
    expect(jobs[0]).toMatchObject({ contract_id: CONTRACT, dynamic_id: QR_ID });
    expect(jobs[0].dedupe_key).toBe(`force:${CONTRACT}`);
  });

  it("closes the contract before deleting a dynamic that had one", async () => {
    stubChainEnv("shadow");
    const CONTRACT = "C".padEnd(56, "B");
    prismaMock.postDynamic.findMany.mockResolvedValue([
      {
        dynamic_id: GOING_ID,
        kind: "going",
        status: "active",
        establishment_id: null,
        token: null,
        _count: { participations: 0 },
      },
    ]);
    prismaMock.postDynamic.findUnique.mockResolvedValue({ contract_id: CONTRACT });

    await applyDynamicPatch({
      postId: POST_ID,
      now: NOW,
      patch: { upserts: [], close_ids: [], remove_ids: [GOING_ID] },
    });

    expect(prismaMock.dynamicChainJob.upsert).toHaveBeenCalledTimes(1);
    expect(upsertedJobs()[0]).toMatchObject({
      type: "close",
      contract_id: CONTRACT,
      dynamic_id: GOING_ID,
    });
    expect(prismaMock.postDynamic.delete).toHaveBeenCalledWith({
      where: { dynamic_id: GOING_ID },
    });
  });

  it("queues a forced close when the author closes a dynamic with a contract", async () => {
    stubChainEnv("shadow");
    const CONTRACT = "C".padEnd(56, "D");
    prismaMock.postDynamic.findMany.mockResolvedValue([
      {
        dynamic_id: GOING_ID,
        kind: "going",
        status: "active",
        establishment_id: null,
        token: null,
        _count: { participations: 2 },
      },
    ]);
    prismaMock.postDynamic.findUnique.mockResolvedValue({ contract_id: CONTRACT });

    await applyDynamicPatch({
      postId: POST_ID,
      now: NOW,
      patch: { upserts: [], close_ids: [GOING_ID], remove_ids: [] },
    });

    expect(upsertedJobs()).toEqual([
      expect.objectContaining({ type: "close", contract_id: CONTRACT }),
    ]);
  });
});
