import { beforeEach, describe, expect, it, vi } from "vitest";

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
  const queryRaw = vi.fn();
  const tx = {
    postDynamic,
    postDynamicParticipation,
    $queryRaw: queryRaw,
  };
  return {
    postDynamic,
    postDynamicParticipation,
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
