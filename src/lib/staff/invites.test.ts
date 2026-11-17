import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => {
  const mock = {
    user: { findUnique: vi.fn(), updateMany: vi.fn() },
    staffInvite: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn(),
    },
    staffMember: { upsert: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    establishment: { findFirst: vi.fn() },
    $transaction: vi.fn(),
  };
  return mock;
});

function resetMocks() {
  vi.clearAllMocks();
  prismaMock.$transaction.mockImplementation(
    async (fn: (tx: typeof prismaMock) => unknown) => fn(prismaMock)
  );
}

vi.mock("src/lib/db", () => ({ default: prismaMock }));

import {
  createStaffInvite,
  hashStaffInviteToken,
  redeemStaffInvite,
  revokeStaffMember,
} from "./invites";
import { isStaffInviteToken } from "./constants";

const NOW = new Date("2026-11-17T12:00:00Z");
const TOKEN = "abcdefghijklmnopqrstuvwxyz012345";

function validInvite(overrides: Record<string, unknown> = {}) {
  return {
    invite_id: "inv-1",
    admin_id: "admin-1",
    establishment_id: "est-1",
    expires_at: new Date(NOW.getTime() + 60_000),
    used_at: null,
    revoked_at: null,
    establishment: { name: "Café Luna" },
    ...overrides,
  };
}

describe("createStaffInvite", () => {
  beforeEach(resetMocks);

  it("stores only the hash and returns a join link with a valid token", async () => {
    prismaMock.establishment.findFirst.mockResolvedValue({
      establishment_id: "est-1",
      name: "Café Luna",
    });
    prismaMock.staffInvite.create.mockResolvedValue({
      invite_id: "inv-1",
      expires_at: NOW,
      created_at: NOW,
    });

    const result = await createStaffInvite({
      adminId: "admin-1",
      origin: "https://tonki.test",
      now: NOW,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const token = result.invite.url.split("/mesero/unirse/")[1];
    expect(isStaffInviteToken(token)).toBe(true);
    const data = prismaMock.staffInvite.create.mock.calls[0][0].data;
    expect(data.token_hash).toBe(hashStaffInviteToken(token));
    expect(JSON.stringify(data)).not.toContain(token);
  });

  it("requires an establishment", async () => {
    prismaMock.establishment.findFirst.mockResolvedValue(null);
    const result = await createStaffInvite({ adminId: "a", origin: "https://x" });
    expect(result).toMatchObject({ ok: false, status: 400 });
  });
});

describe("redeemStaffInvite", () => {
  beforeEach(() => {
    resetMocks();
    prismaMock.user.findUnique.mockResolvedValue({ type: "user", status: "active" });
    prismaMock.staffInvite.findUnique.mockResolvedValue(validInvite());
    prismaMock.staffInvite.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.user.updateMany.mockResolvedValue({ count: 1 });
  });

  it("turns a customer into staff of the inviting business", async () => {
    const result = await redeemStaffInvite({ userId: "u-1", token: TOKEN, now: NOW });

    expect(result).toEqual({ ok: true, establishment_name: "Café Luna" });
    expect(prismaMock.staffInvite.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { token_hash: hashStaffInviteToken(TOKEN) } })
    );
    expect(prismaMock.user.updateMany.mock.calls[0][0].data).toEqual({ type: "staff" });
    const upsert = prismaMock.staffMember.upsert.mock.calls[0][0];
    expect(upsert.create).toMatchObject({
      user_id: "u-1",
      admin_id: "admin-1",
      establishment_id: "est-1",
      status: "active",
    });
  });

  it("rejects business accounts", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ type: "admin", status: "active" });
    const result = await redeemStaffInvite({ userId: "u-1", token: TOKEN, now: NOW });
    expect(result).toMatchObject({ ok: false, status: 403 });
    expect(prismaMock.staffInvite.updateMany).not.toHaveBeenCalled();
  });

  it("rejects someone who is already staff", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ type: "staff", status: "active" });
    const result = await redeemStaffInvite({ userId: "u-1", token: TOKEN, now: NOW });
    expect(result).toMatchObject({ ok: false, status: 409 });
  });

  it("rejects expired, used and revoked invites", async () => {
    prismaMock.staffInvite.findUnique.mockResolvedValue(
      validInvite({ expires_at: new Date(NOW.getTime() - 1) })
    );
    expect(await redeemStaffInvite({ userId: "u-1", token: TOKEN, now: NOW })).toMatchObject({
      ok: false,
      status: 410,
    });

    prismaMock.staffInvite.findUnique.mockResolvedValue(validInvite({ used_at: NOW }));
    expect(await redeemStaffInvite({ userId: "u-1", token: TOKEN, now: NOW })).toMatchObject({
      ok: false,
      status: 409,
    });

    prismaMock.staffInvite.findUnique.mockResolvedValue(validInvite({ revoked_at: NOW }));
    expect(await redeemStaffInvite({ userId: "u-1", token: TOKEN, now: NOW })).toMatchObject({
      ok: false,
      status: 404,
    });
    expect(prismaMock.user.updateMany).not.toHaveBeenCalled();
  });

  it("loses the race cleanly when another redeem consumed the invite", async () => {
    prismaMock.staffInvite.updateMany.mockResolvedValue({ count: 0 });
    const result = await redeemStaffInvite({ userId: "u-1", token: TOKEN, now: NOW });
    expect(result).toMatchObject({ ok: false, status: 409 });
    expect(prismaMock.user.updateMany).not.toHaveBeenCalled();
  });
});

describe("revokeStaffMember", () => {
  beforeEach(resetMocks);

  it("revokes the membership and turns the account back into a customer", async () => {
    prismaMock.staffMember.findFirst.mockResolvedValue({ staff_id: "s-1", user_id: "u-1" });
    const result = await revokeStaffMember({ adminId: "admin-1", staffId: "s-1", now: NOW });

    expect(result).toEqual({ ok: true });
    expect(prismaMock.staffMember.findFirst.mock.calls[0][0].where).toMatchObject({
      admin_id: "admin-1",
    });
    expect(prismaMock.staffMember.update.mock.calls[0][0].data).toEqual({
      status: "revoked",
      revoked_at: NOW,
    });
    expect(prismaMock.user.updateMany.mock.calls[0][0]).toEqual({
      where: { user_id: "u-1", type: "staff" },
      data: { type: "user" },
    });
  });

  it("does not touch staff of another business", async () => {
    prismaMock.staffMember.findFirst.mockResolvedValue(null);
    const result = await revokeStaffMember({ adminId: "other", staffId: "s-1" });
    expect(result).toMatchObject({ ok: false, status: 404 });
    expect(prismaMock.user.updateMany).not.toHaveBeenCalled();
  });
});
