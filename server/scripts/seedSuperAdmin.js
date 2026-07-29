import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function initialsFor(name) {
  return name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

async function main() {
  const email = process.env.SEED_EMAIL;
  const password = process.env.SEED_PASSWORD;
  const name = process.env.SEED_NAME || 'Kotka Admin';

  if (!email || !password) {
    console.error('Usage: SEED_EMAIL=... SEED_PASSWORD=... node scripts/seedSuperAdmin.js');
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.user.upsert({
    where: { email },
    update: { passwordHash, role: 'super_admin', plan: 'Institutional' },
    create: {
      name,
      email,
      passwordHash,
      initials: initialsFor(name),
      role: 'super_admin',
      plan: 'Institutional',
      settings: { create: {} },
    },
  });

  console.log(`Seeded super admin: ${user.email} (id: ${user.id}, role: ${user.role})`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
