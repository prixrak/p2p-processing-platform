/**
 * Ensures core fiat reference currencies (UAH, USD) and a single OWNER user so an empty
 * database can be configured without full seed.
 * Run after migrate: `npm run db:bootstrap` from repo root.
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const DEFAULT_OWNER_EMAIL = 'owner@p2p.local';
const DEFAULT_OWNER_PASSWORD = 'admin123';

const CORE_CURRENCY_CODES = ['UAH', 'USD'] as const;

async function ensureCoreCurrencies(): Promise<void> {
  for (const code of CORE_CURRENCY_CODES) {
    await prisma.currency.upsert({
      where: { code },
      update: {},
      create: { code },
    });
  }
  console.log(`Bootstrap OK: currencies ${CORE_CURRENCY_CODES.join(', ')} ensured.`);
}

async function main() {
  await ensureCoreCurrencies();

  const email = process.env.BOOTSTRAP_OWNER_EMAIL ?? DEFAULT_OWNER_EMAIL;
  const password = process.env.BOOTSTRAP_OWNER_PASSWORD ?? DEFAULT_OWNER_PASSWORD;

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
    console.log(`Default password: ${DEFAULT_OWNER_PASSWORD} (set BOOTSTRAP_OWNER_PASSWORD to override)`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
