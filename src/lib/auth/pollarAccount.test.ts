import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  authIdentity: {
    findUnique: vi.fn(),
    create: vi.fn(),
  },
  user: {
    findMany: vi.fn(),
    update: vi.fn(),
    create: vi.fn(),
  },
  $transaction: vi.fn(),
}));

vi.mock("src/lib/db", () => ({
  default: prismaMock,
}));

import { findOrCreateUserFromPollar, PollarLinkError } from "src/lib/auth/pollarAccount";
import type { VerifiedPollarIdentity } from "src/lib/auth/verifyPollarToken";

const wallet = `${"G"}${"B".repeat(55)}`;

const identity: VerifiedPollarIdentity = {
  pollarUserId: "pollar-1",
  email: "Admin@Tonki.io",
  displayName: "Admin Tonki",
  avatarUrl: null,
  walletAddress: wallet,
  authProvider: "google",
};

function user(overrides: Record<string, unknown> = {}) {
  return {
    user_id: "user-1",
    email: "admin@tonki.io",
    name: "Admin Tonki",
    first_name: null,
    paternal_surname: null,
    maternal_surname: null,
    avatar_url: null,
    wallet_address: null,
    age: null,
    birth_date: null,
    type: "admin",
    status: "active",
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

describe("findOrCreateUserFromPollar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the user already linked to this Pollar id", async () => {
    const existing = user({ wallet_address: wallet });
    prismaMock.authIdentity.findUnique.mockResolvedValue({ user: existing });

    const result = await findOrCreateUserFromPollar(identity);

    expect(result).toEqual({ user: existing, isNew: false });
    expect(prismaMock.user.findMany).not.toHaveBeenCalled();
  });

  it("links an existing admin by email and stores the Pollar wallet", async () => {
    const existing = user();
    prismaMock.authIdentity.findUnique.mockResolvedValue(null);
    prismaMock.user.findMany.mockResolvedValue([existing]);
    prismaMock.$transaction.mockImplementation(async (fn) =>
      fn({
        authIdentity: { create: vi.fn().mockResolvedValue({}) },
        user: {
          update: vi.fn().mockResolvedValue({
            ...existing,
            wallet_address: wallet,
          }),
        },
      })
    );

    const result = await findOrCreateUserFromPollar(identity);

    expect(result.isNew).toBe(false);
    expect(result.user.wallet_address).toBe(wallet);
    expect(result.user.type).toBe("admin");
  });

  it("links an existing user by Freighter wallet when email is absent", async () => {
    const existing = user({ email: null, wallet_address: wallet, type: "user" });
    prismaMock.authIdentity.findUnique.mockResolvedValue(null);
    prismaMock.user.findMany.mockResolvedValue([existing]);
    prismaMock.$transaction.mockImplementation(async (fn) =>
      fn({
        authIdentity: { create: vi.fn().mockResolvedValue({}) },
        user: { update: vi.fn().mockResolvedValue(existing) },
      })
    );

    const result = await findOrCreateUserFromPollar({
      ...identity,
      email: null,
    });

    expect(result.user.user_id).toBe("user-1");
    expect(result.isNew).toBe(false);
  });

  it("refuses to guess when the email belongs to more than one user", async () => {
    prismaMock.authIdentity.findUnique.mockResolvedValue(null);
    prismaMock.user.findMany.mockResolvedValue([
      user({ user_id: "a" }),
      user({ user_id: "b" }),
    ]);

    await expect(findOrCreateUserFromPollar(identity)).rejects.toMatchObject({
      reason: "duplicate_email",
    });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("refuses to link when email and wallet point at different users", async () => {
    prismaMock.authIdentity.findUnique.mockResolvedValue(null);
    prismaMock.user.findMany.mockResolvedValue([
      user({ user_id: "by-email", wallet_address: null }),
      user({ user_id: "by-wallet", email: "other@example.com", wallet_address: wallet }),
    ]);

    await expect(findOrCreateUserFromPollar(identity)).rejects.toBeInstanceOf(
      PollarLinkError
    );
  });

  it("creates a user account when nothing matches", async () => {
    const created = user({ type: "user", email: "admin@tonki.io", wallet_address: wallet });
    prismaMock.authIdentity.findUnique.mockResolvedValue(null);
    prismaMock.user.findMany.mockResolvedValue([]);
    prismaMock.$transaction.mockImplementation(async (fn) =>
      fn({
        user: { create: vi.fn().mockResolvedValue(created) },
        authIdentity: { create: vi.fn().mockResolvedValue({}) },
      })
    );

    const result = await findOrCreateUserFromPollar(identity);

    expect(result).toEqual({ user: created, isNew: true });
  });

  it("returns the raced link when identity creation conflicts", async () => {
    const existing = user();
    prismaMock.authIdentity.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ user: existing });
    prismaMock.user.findMany.mockResolvedValue([]);
    prismaMock.$transaction.mockRejectedValue({ code: "P2002" });

    const result = await findOrCreateUserFromPollar(identity);

    expect(result).toEqual({ user: existing, isNew: false });
  });
});
