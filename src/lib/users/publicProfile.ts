import prisma from "src/lib/db";

export type PublicUserProfile = {
  user_id: string;
  name: string;
  avatar_url: string | null;
  member_since: string;
  establishment: {
    establishment_id: string;
    name: string;
    avatar_url: string | null;
  } | null;
};

export async function loadPublicUserProfile(
  userId: string
): Promise<PublicUserProfile | null> {
  const user = await prisma.user.findUnique({
    where: { user_id: userId },
    select: {
      user_id: true,
      name: true,
      avatar_url: true,
      status: true,
      created_at: true,
      establishments: {
        orderBy: { created_at: "asc" },
        take: 1,
        select: {
          establishment_id: true,
          name: true,
          avatar_url: true,
        },
      },
    },
  });
  if (!user || user.status !== "active") return null;

  return {
    user_id: user.user_id,
    name: user.name,
    avatar_url: user.avatar_url,
    member_since: user.created_at.toISOString(),
    establishment: user.establishments[0] ?? null,
  };
}
