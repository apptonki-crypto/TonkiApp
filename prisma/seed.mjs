import { PrismaClient } from "../src/generated/prisma/client";

const prisma = new PrismaClient();

const SEED_USERS = [
  {
    wallet_address: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
    name: "Test User",
    type: "user",
  },
  {
    wallet_address: "GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBRD",
    name: "Test Admin",
    type: "admin",
  },
];

async function main() {
  for (const testUser of SEED_USERS) {
    let user = await prisma.user.findFirst({
      where: { wallet_address: testUser.wallet_address },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          name: testUser.name,
          wallet_address: testUser.wallet_address,
          type: testUser.type,
          status: "active",
        },
      });
    }
  }

  const admin = await prisma.user.findFirst({
    where: { wallet_address: SEED_USERS[1].wallet_address },
  });
  if (admin) {
    const adminId = admin.user_id;
    const existing = await prisma.post.count({ where: { author_id: adminId } });
    if (existing === 0) {
      await prisma.post.create({
        data: {
          author_id: adminId,
          title: "Welcome to the feed",
          body: "Seed post for local development. Uploads API can attach files later.",
        },
      });
      await prisma.post.create({
        data: {
          author_id: adminId,
          title: "Sample post with attachment metadata",
          body: "Non-image attachments show as links in the UI.",
          attachments: {
            create: [
              {
                url: "https://example.com/doc.pdf",
                mime_type: "application/pdf",
                original_name: "sample.pdf",
              },
            ],
          },
        },
      });
      await prisma.post.create({
        data: {
          author_id: adminId,
          title: "Another seeded update",
          body: null,
          attachments: {
            create: {
              url: "/uploads/posts/seed/placeholder.svg",
              mime_type: "image/svg+xml",
              original_name: "placeholder.svg",
            },
          },
        },
      });
    }
  }

  for (const u of SEED_USERS) {
    console.log(`  • ${u.name} (${u.type})`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
