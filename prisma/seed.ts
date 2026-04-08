// Run with: npx ts-node --compiler-options '{"module":"commonjs"}' prisma/seed.ts
// Or:       npx tsx prisma/seed.ts

const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

async function main() {
  const email = process.argv[2];
  const password = process.argv[3];

  if (!email || !password) {
    console.log("Usage: npx tsx prisma/seed.ts <admin-email> <admin-password>");
    console.log("Example: npx tsx prisma/seed.ts raison@kellogg.edu MySecurePass123");
    process.exit(1);
  }

  const hashed = await bcrypt.hash(password, 12);

  const admin = await prisma.user.upsert({
    where: { email: email.toLowerCase().trim() },
    update: { role: "admin", password: hashed },
    create: {
      email: email.toLowerCase().trim(),
      name: "Admin",
      password: hashed,
      role: "admin",
    },
  });

  console.log(`✓ Admin user created/updated: ${admin.email} (id: ${admin.id})`);
  console.log(`  Role: ${admin.role}`);
  console.log(`\nYou can now sign in at your app URL.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
