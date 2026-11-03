import type { User } from "src/generated/prisma/client";
import prisma from "src/lib/db";
import { POLLAR_PROVIDER } from "src/lib/auth/pollarServer";
import type { VerifiedPollarIdentity } from "src/lib/auth/verifyPollarToken";

export class PollarLinkError extends Error {
  constructor(
    readonly reason: "duplicate_email" | "ambiguous_wallet" | "identity_conflict"
  ) {
    super(reason);
    this.name = "PollarLinkError";
  }
}

type AccountDb = typeof prisma;

function normalizeEmail(email: string | null | undefined): string | null {
  const value = email?.trim().toLowerCase();
  return value ? value.slice(0, 100) : null;
}

function emailsEqual(left: string | null | undefined, right: string | null): boolean {
  if (!right) return false;
  return normalizeEmail(left) === right;
}

function displayNameFrom(identity: VerifiedPollarIdentity): string {
  if (identity.displayName?.trim()) return identity.displayName.trim().slice(0, 100);
  const local = identity.email?.split("@")[0]?.trim();
  return (local || "Tonki user").slice(0, 100);
}

function isPrismaUniqueConflict(err: unknown): boolean {
  return (
    !!err &&
    typeof err === "object" &&
    "code" in err &&
    (err as { code: string }).code === "P2002"
  );
}

async function loadLinkedUser(
  db: AccountDb,
  pollarUserId: string
): Promise<User | null> {
  const existing = await db.authIdentity.findUnique({
    where: {
      provider_provider_subject: {
        provider: POLLAR_PROVIDER,
        provider_subject: pollarUserId,
      },
    },
    include: { user: true },
  });
  return existing?.user ?? null;
}

export async function findOrCreateUserFromPollar(
  identity: VerifiedPollarIdentity,
  db: AccountDb = prisma
): Promise<{ user: User; isNew: boolean }> {
  const email = normalizeEmail(identity.email);
  const wallet = identity.walletAddress;
  const displayName = displayNameFrom(identity);

  const alreadyLinked = await loadLinkedUser(db, identity.pollarUserId);
  if (alreadyLinked) {
    const data: { wallet_address?: string; email?: string; name?: string } = {};
    if (wallet && alreadyLinked.wallet_address !== wallet) {
      data.wallet_address = wallet;
    }
    if (email && !alreadyLinked.email) data.email = email;
    if (displayName && alreadyLinked.name === "Tonki user") data.name = displayName;
    if (Object.keys(data).length === 0) {
      return { user: alreadyLinked, isNew: false };
    }
    const user = await db.user.update({
      where: { user_id: alreadyLinked.user_id },
      data,
    });
    return { user, isNew: false };
  }

  const or: { email?: string; wallet_address?: string }[] = [];
  if (email) or.push({ email });
  if (wallet) or.push({ wallet_address: wallet });

  const candidates =
    or.length === 0
      ? []
      : await db.user.findMany({
          where: { OR: or },
        });

  const emailMatches = email
    ? candidates.filter((user) => emailsEqual(user.email, email))
    : [];
  if (emailMatches.length > 1) throw new PollarLinkError("duplicate_email");

  const walletMatches = wallet
    ? candidates.filter((user) => user.wallet_address === wallet)
    : [];
  if (walletMatches.length > 1) throw new PollarLinkError("ambiguous_wallet");

  const emailUser = emailMatches[0] ?? null;
  const walletUser = walletMatches[0] ?? null;
  if (emailUser && walletUser && emailUser.user_id !== walletUser.user_id) {
    throw new PollarLinkError("identity_conflict");
  }

  const target = emailUser ?? walletUser;
  if (target) {
    try {
      const user = await db.$transaction(async (tx) => {
        await tx.authIdentity.create({
          data: {
            user_id: target.user_id,
            provider: POLLAR_PROVIDER,
            provider_subject: identity.pollarUserId,
            email,
            email_verified: Boolean(email),
            display_name: displayName,
            avatar_url: identity.avatarUrl,
          },
        });
        return tx.user.update({
          where: { user_id: target.user_id },
          data: {
            ...(wallet ? { wallet_address: wallet } : {}),
            ...(email && !target.email ? { email } : {}),
          },
        });
      });
      return { user, isNew: false };
    } catch (err) {
      if (!isPrismaUniqueConflict(err)) throw err;
      const raced = await loadLinkedUser(db, identity.pollarUserId);
      if (!raced) throw err;
      return { user: raced, isNew: false };
    }
  }

  try {
    const user = await db.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          name: displayName,
          email,
          wallet_address: wallet,
          type: "user",
          status: "active",
        },
      });
      await tx.authIdentity.create({
        data: {
          user_id: created.user_id,
          provider: POLLAR_PROVIDER,
          provider_subject: identity.pollarUserId,
          email,
          email_verified: Boolean(email),
          display_name: displayName,
          avatar_url: identity.avatarUrl,
        },
      });
      return created;
    });
    return { user, isNew: true };
  } catch (err) {
    if (!isPrismaUniqueConflict(err)) throw err;
    const raced = await loadLinkedUser(db, identity.pollarUserId);
    if (!raced) throw err;
    return { user: raced, isNew: false };
  }
}
