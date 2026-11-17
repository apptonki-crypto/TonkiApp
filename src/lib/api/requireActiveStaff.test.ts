import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({ user: { findUnique: vi.fn() } }));
const sessionMock = vi.hoisted(() => ({ getSessionUserId: vi.fn() }));

vi.mock("src/lib/db", () => ({ default: prismaMock }));
vi.mock("src/lib/auth/session", () => sessionMock);

import { requireActiveStaffSession } from "./requireActiveStaff";

function staffUser(overrides: Record<string, unknown> = {}) {
  return {
    name: "Ana",
    status: "active",
    type: "staff",
    staff_membership: {
      status: "active",
      admin_id: "admin-1",
      establishment_id: "est-1",
      admin: { status: "active", type: "admin" },
    },
    ...overrides,
  };
}

describe("requireActiveStaffSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionMock.getSessionUserId.mockResolvedValue("u-1");
  });

  it("returns the business the waiter charges for", async () => {
    prismaMock.user.findUnique.mockResolvedValue(staffUser());
    const gate = await requireActiveStaffSession();
    expect(gate).toMatchObject({
      ok: true,
      userId: "u-1",
      adminId: "admin-1",
      establishmentId: "est-1",
    });
  });

  it("rejects without session", async () => {
    sessionMock.getSessionUserId.mockResolvedValue(null);
    const gate = await requireActiveStaffSession();
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.response.status).toBe(401);
  });

  it("rejects a revoked waiter even if the JWT still says staff", async () => {
    prismaMock.user.findUnique.mockResolvedValue(
      staffUser({
        type: "user",
        staff_membership: {
          status: "revoked",
          admin_id: "admin-1",
          establishment_id: "est-1",
          admin: { status: "active", type: "admin" },
        },
      })
    );
    const gate = await requireActiveStaffSession();
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.response.status).toBe(403);
  });

  it("rejects customers and waiters of a suspended business", async () => {
    prismaMock.user.findUnique.mockResolvedValue(
      staffUser({ type: "user", staff_membership: null })
    );
    expect((await requireActiveStaffSession()).ok).toBe(false);

    prismaMock.user.findUnique.mockResolvedValue(
      staffUser({
        staff_membership: {
          status: "active",
          admin_id: "admin-1",
          establishment_id: "est-1",
          admin: { status: "suspended", type: "admin" },
        },
      })
    );
    expect((await requireActiveStaffSession()).ok).toBe(false);
  });
});
