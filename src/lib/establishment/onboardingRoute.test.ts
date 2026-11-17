import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    user: { findUnique: vi.fn(), updateMany: vi.fn() },
    establishment: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(),
  },
  requireActiveAdminSession: vi.fn(),
}));

vi.mock("src/lib/db", () => ({ default: mocks.prisma }));
vi.mock("src/lib/api/requireActiveAdmin", () => ({
  requireActiveAdminSession: mocks.requireActiveAdminSession,
}));
vi.mock("src/lib/auth/saveAvatarUpload", () => ({
  AvatarUploadError: class AvatarUploadError extends Error {},
  saveAvatarUpload: vi.fn(),
}));

import { POST } from "../../../app/api/establishment/onboarding/route";

const body = {
  name: "El Campestre",
  category: "Cafetería",
  description: "Café de especialidad",
  address: "Calle 1 #2",
  phone: "5555555555",
  hours: JSON.stringify({
    mon: { closed: false, open: "09:00", close: "18:00" },
  }),
  cashback_percent: 5,
};

function request(payload: unknown) {
  return new Request("http://localhost/api/establishment/onboarding", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

const createdRow = {
  establishment_id: "est-1",
  admin_id: "admin-1",
  name: body.name,
  address: body.address,
  category: body.category,
  avatar_url: null,
  description: body.description,
  phone: body.phone,
  website: null,
  hours: body.hours,
  location_x: null,
  location_y: null,
  location_z: null,
  cashback_percent: 5,
  images: [],
};

describe("POST /api/establishment/onboarding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireActiveAdminSession.mockResolvedValue({
      ok: true,
      userId: "admin-1",
    });
    mocks.prisma.establishment.findFirst.mockResolvedValue(null);
    mocks.prisma.$transaction.mockImplementation(
      async (fn: (tx: typeof mocks.prisma) => unknown) => fn(mocks.prisma)
    );
  });

  it("saves the profile once and marks it as completed", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({
      type: "admin",
      business_profile_completed_at: null,
    });
    mocks.prisma.user.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.establishment.create.mockResolvedValue(createdRow);

    const res = await POST(request(body));

    expect(res.status).toBe(200);
    expect(mocks.prisma.user.updateMany).toHaveBeenCalledWith({
      where: { user_id: "admin-1", business_profile_completed_at: null },
      data: { business_profile_completed_at: expect.any(Date) },
    });
    expect(mocks.prisma.establishment.create).toHaveBeenCalledTimes(1);
  });

  it("refuses a second submission once the profile is completed", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({
      type: "admin",
      business_profile_completed_at: new Date(),
    });

    const res = await POST(request(body));

    expect(res.status).toBe(409);
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
    expect(mocks.prisma.establishment.create).not.toHaveBeenCalled();
  });

  it("refuses a concurrent submission that loses the race", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({
      type: "admin",
      business_profile_completed_at: null,
    });
    mocks.prisma.user.updateMany.mockResolvedValue({ count: 0 });

    const res = await POST(request(body));

    expect(res.status).toBe(409);
    expect(mocks.prisma.establishment.create).not.toHaveBeenCalled();
  });

  it("rejects an incomplete profile without touching the database", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({
      type: "admin",
      business_profile_completed_at: null,
    });

    const res = await POST(request({ ...body, phone: "" }));

    expect(res.status).toBe(400);
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });
});
