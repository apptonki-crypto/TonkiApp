import { afterEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  dynamicChainJob: { groupBy: vi.fn(), count: vi.fn(), findFirst: vi.fn() },
  postDynamic: { groupBy: vi.fn() },
}));

vi.mock("src/lib/db", () => ({ default: prismaMock }));

import { getChainCostReport, stroopsToXlm } from "src/lib/posts/chain/costs";

const NOW = new Date("2027-01-15T18:00:00.000Z");

afterEach(() => vi.unstubAllEnvs());

describe("stroopsToXlm", () => {
  it("converts without drifting on small fees", () => {
    expect(stroopsToXlm(BigInt(10_000_000))).toBe(1);
    expect(stroopsToXlm(BigInt(123_456))).toBeCloseTo(0.0123456, 7);
    expect(stroopsToXlm(BigInt(0))).toBe(0);
  });
});

describe("getChainCostReport", () => {
  it("sums fees per job type and reports queue health", async () => {
    vi.stubEnv("DYNAMICS_CHAIN_MODE", "shadow");
    vi.stubEnv("DYNAMICS_CHAIN_KINDS", "going,qr");
    prismaMock.dynamicChainJob.groupBy.mockResolvedValue([
      { type: "deploy", status: "done", _count: { _all: 2 }, _sum: { fee_stroops: BigInt(4_000_000) } },
      { type: "participation", status: "done", _count: { _all: 10 }, _sum: { fee_stroops: BigInt(1_000_000) } },
      { type: "participation", status: "pending", _count: { _all: 3 }, _sum: { fee_stroops: null } },
      { type: "participation", status: "failed", _count: { _all: 1 }, _sum: { fee_stroops: null } },
    ]);
    prismaMock.postDynamic.groupBy.mockResolvedValue([
      { chain_status: "active", _count: { _all: 4 } },
      { chain_status: "legacy", _count: { _all: 7 } },
    ]);
    prismaMock.dynamicChainJob.count.mockResolvedValue(1);
    prismaMock.dynamicChainJob.findFirst.mockResolvedValue({
      created_at: new Date("2027-01-15T17:00:00.000Z"),
    });

    const report = await getChainCostReport({ days: 7, now: NOW });

    expect(report).toMatchObject({
      mode: "shadow",
      enabled_kinds: ["going", "qr"],
      window_days: 7,
      total_fee_stroops: "5000000",
      total_fee_xlm: 0.5,
      dynamics: { active: 4, legacy: 7 },
      failed_jobs: 1,
      oldest_pending_at: "2027-01-15T17:00:00.000Z",
    });
    expect(report.by_type.find((r) => r.type === "deploy")).toMatchObject({
      done: 2,
      fee_xlm: 0.4,
      avg_fee_xlm: 0.2,
    });
    expect(report.by_type.find((r) => r.type === "participation")).toMatchObject({
      done: 10,
      pending: 3,
      failed: 1,
      avg_fee_xlm: 0.01,
    });
    expect(report.by_type.find((r) => r.type === "bump")?.avg_fee_xlm).toBeNull();
    expect(prismaMock.dynamicChainJob.groupBy.mock.calls[0][0].where.created_at.gte).toEqual(
      new Date("2027-01-08T18:00:00.000Z")
    );
  });

  it("clamps the window and handles an empty database", async () => {
    prismaMock.dynamicChainJob.groupBy.mockResolvedValue([]);
    prismaMock.postDynamic.groupBy.mockResolvedValue([]);
    prismaMock.dynamicChainJob.count.mockResolvedValue(0);
    prismaMock.dynamicChainJob.findFirst.mockResolvedValue(null);

    const report = await getChainCostReport({ days: 99999, now: NOW });

    expect(report.window_days).toBe(365);
    expect(report).toMatchObject({
      mode: "off",
      enabled_kinds: [],
      total_fee_stroops: "0",
      oldest_pending_at: null,
    });
  });
});
