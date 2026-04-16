/**
 * Creates a single OWNER user so an empty database can be configured without full seed.
 * Run after migrate: `npm run db:bootstrap` from repo root.
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.BOOTSTRAP_OWNER_EMAIL ?? 'owner@e2e.local';
  const password = process.env.BOOTSTRAP_OWNER_PASSWORD ?? 'E2ETest123!';

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`Bootstrap skip: user already exists (${email}).`);
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.user.create({
    data: { email, passwordHash, role: 'OWNER' },
  });

  console.log(`Bootstrap OK: OWNER created — ${email}`);
  if (!process.env.BOOTSTRAP_OWNER_PASSWORD) {
    console.log('Default password: E2ETest123! (set BOOTSTRAP_OWNER_PASSWORD to override)');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
