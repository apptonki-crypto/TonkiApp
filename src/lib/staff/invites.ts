import { createHash, randomBytes } from "crypto";

import prisma from "src/lib/db";
import {
  STAFF_INVITE_TTL_MS,
  STAFF_JOIN_PATH_PREFIX,
  STAFF_STATUS_ACTIVE,
  STAFF_STATUS_REVOKED,
} from "src/lib/staff/constants";
import type {
  CreatedStaffInvite,
  StaffInviteView,
  StaffMemberView,
} from "src/lib/staff/types";

type Fail = { ok: false; status: number; error: string };

export function createStaffInviteToken(): string {
  return randomBytes(24).toString("base64url");
}

export function hashStaffInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Mismo criterio que `createConsumptionCharge`: el primer establecimiento del admin. */
async function findAdminEstablishment(adminId: string) {
  return prisma.establishment.findFirst({
    where: { admin_id: adminId },
    orderBy: { created_at: "asc" },
    select: { establishment_id: true, name: true },
  });
}

export async function createStaffInvite(input: {
  adminId: string;
  origin: string;
  now?: Date;
}): Promise<{ ok: true; invite: CreatedStaffInvite } | Fail> {
  const establishment = await findAdminEstablishment(input.adminId);
  if (!establishment) {
    return {
      ok: false,
      status: 400,
      error: "No tienes un establecimiento configurado",
    };
  }
  const now = input.now ?? new Date();
  const token = createStaffInviteToken();
  const row = await prisma.staffInvite.create({
    data: {
      admin_id: input.adminId,
      establishment_id: establishment.establishment_id,
      token_hash: hashStaffInviteToken(token),
      expires_at: new Date(now.getTime() + STAFF_INVITE_TTL_MS),
    },
    select: { invite_id: true, expires_at: true, created_at: true },
  });
  return {
    ok: true,
    invite: {
      invite_id: row.invite_id,
      expires_at: row.expires_at.toISOString(),
      created_at: row.created_at.toISOString(),
      url: `${input.origin}${STAFF_JOIN_PATH_PREFIX}${token}`,
    },
  };
}

/** Datos públicos de una invitación para la pantalla "Unirme". */
export async function previewStaffInvite(
  token: string,
  now: Date = new Date()
): Promise<{ ok: true; establishment_name: string } | Fail> {
  const invite = await prisma.staffInvite.findUnique({
    where: { token_hash: hashStaffInviteToken(token) },
    select: {
      expires_at: true,
      used_at: true,
      revoked_at: true,
      establishment: { select: { name: true } },
    },
  });
  const unusable = inviteUnusableError(invite, now);
  if (unusable) return unusable;
  return { ok: true, establishment_name: invite!.establishment.name };
}

function inviteUnusableError(
  invite: { expires_at: Date; used_at: Date | null; revoked_at: Date | null } | null,
  now: Date
): Fail | null {
  if (!invite || invite.revoked_at) {
    return { ok: false, status: 404, error: "Esta invitación no existe o fue cancelada." };
  }
  if (invite.used_at) {
    return { ok: false, status: 409, error: "Esta invitación ya se usó. Pide una nueva al negocio." };
  }
  if (invite.expires_at.getTime() <= now.getTime()) {
    return { ok: false, status: 410, error: "Esta invitación venció. Pide una nueva al negocio." };
  }
  return null;
}

/**
 * Convierte a un cliente en mesero del negocio que lo invitó.
 * Todo en una transacción: la invitación se consume una sola vez aunque
 * lleguen dos canjes al mismo tiempo.
 */
export async function redeemStaffInvite(input: {
  userId: string;
  token: string;
  now?: Date;
}): Promise<{ ok: true; establishment_name: string } | Fail> {
  const now = input.now ?? new Date();
  const tokenHash = hashStaffInviteToken(input.token);

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { user_id: input.userId },
      select: { type: true, status: true },
    });
    if (!user || user.status !== "active") {
      return { ok: false as const, status: 403, error: "Cuenta suspendida" };
    }
    if (user.type === "admin") {
      return {
        ok: false as const,
        status: 403,
        error: "Una cuenta de negocio no puede ser mesero. Entra con otra cuenta.",
      };
    }
    if (user.type === "staff") {
      return {
        ok: false as const,
        status: 409,
        error: "Ya eres mesero de un negocio. Pide que te den de baja primero.",
      };
    }
    if (user.type !== "user") {
      return { ok: false as const, status: 403, error: "Esta cuenta no puede ser mesero." };
    }

    const invite = await tx.staffInvite.findUnique({
      where: { token_hash: tokenHash },
      select: {
        invite_id: true,
        admin_id: true,
        establishment_id: true,
        expires_at: true,
        used_at: true,
        revoked_at: true,
        establishment: { select: { name: true } },
      },
    });
    const unusable = inviteUnusableError(invite, now);
    if (unusable) return unusable;

    const claimed = await tx.staffInvite.updateMany({
      where: {
        invite_id: invite!.invite_id,
        used_at: null,
        revoked_at: null,
        expires_at: { gt: now },
      },
      data: { used_at: now, used_by_user_id: input.userId },
    });
    if (claimed.count !== 1) {
      return {
        ok: false as const,
        status: 409,
        error: "Esta invitación ya se usó. Pide una nueva al negocio.",
      };
    }

    const promoted = await tx.user.updateMany({
      where: { user_id: input.userId, type: "user", status: "active" },
      data: { type: "staff" },
    });
    if (promoted.count !== 1) {
      throw new Error("staff redeem: user changed during transaction");
    }

    await tx.staffMember.upsert({
      where: { user_id: input.userId },
      create: {
        user_id: input.userId,
        admin_id: invite!.admin_id,
        establishment_id: invite!.establishment_id,
        status: STAFF_STATUS_ACTIVE,
      },
      update: {
        admin_id: invite!.admin_id,
        establishment_id: invite!.establishment_id,
        status: STAFF_STATUS_ACTIVE,
        created_at: now,
        revoked_at: null,
      },
    });

    return { ok: true as const, establishment_name: invite!.establishment.name };
  });
}

/** Da de baja a un mesero: vuelve a ser cliente y deja de poder cobrar al instante. */
export async function revokeStaffMember(input: {
  adminId: string;
  staffId: string;
  now?: Date;
}): Promise<{ ok: true } | Fail> {
  const now = input.now ?? new Date();
  return prisma.$transaction(async (tx) => {
    const member = await tx.staffMember.findFirst({
      where: {
        staff_id: input.staffId,
        admin_id: input.adminId,
        status: STAFF_STATUS_ACTIVE,
      },
      select: { staff_id: true, user_id: true },
    });
    if (!member) {
      return { ok: false as const, status: 404, error: "Ese mesero no existe." };
    }
    await tx.staffMember.update({
      where: { staff_id: member.staff_id },
      data: { status: STAFF_STATUS_REVOKED, revoked_at: now },
    });
    await tx.user.updateMany({
      where: { user_id: member.user_id, type: "staff" },
      data: { type: "user" },
    });
    return { ok: true as const };
  });
}

export async function revokeStaffInvite(input: {
  adminId: string;
  inviteId: string;
  now?: Date;
}): Promise<{ ok: true } | Fail> {
  const updated = await prisma.staffInvite.updateMany({
    where: {
      invite_id: input.inviteId,
      admin_id: input.adminId,
      used_at: null,
      revoked_at: null,
    },
    data: { revoked_at: input.now ?? new Date() },
  });
  if (updated.count !== 1) {
    return { ok: false, status: 404, error: "Esa invitación ya no está pendiente." };
  }
  return { ok: true };
}

export async function listStaffOverview(
  adminId: string,
  now: Date = new Date()
): Promise<{ members: StaffMemberView[]; invites: StaffInviteView[] }> {
  const [members, invites] = await Promise.all([
    prisma.staffMember.findMany({
      where: { admin_id: adminId, status: STAFF_STATUS_ACTIVE },
      orderBy: { created_at: "desc" },
      select: {
        staff_id: true,
        user_id: true,
        created_at: true,
        user: { select: { name: true, email: true, avatar_url: true } },
      },
    }),
    prisma.staffInvite.findMany({
      where: {
        admin_id: adminId,
        used_at: null,
        revoked_at: null,
        expires_at: { gt: now },
      },
      orderBy: { created_at: "desc" },
      select: { invite_id: true, expires_at: true, created_at: true },
    }),
  ]);
  return {
    members: members.map((m) => ({
      staff_id: m.staff_id,
      user_id: m.user_id,
      name: m.user.name,
      email: m.user.email,
      avatar_url: m.user.avatar_url,
      created_at: m.created_at.toISOString(),
    })),
    invites: invites.map((i) => ({
      invite_id: i.invite_id,
      expires_at: i.expires_at.toISOString(),
      created_at: i.created_at.toISOString(),
    })),
  };
}
