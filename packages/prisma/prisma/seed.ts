import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';

const prisma = new PrismaClient();

function generateApiKey(direction: 'payin' | 'payout') {
  const publicKey = `pk_${direction}_${crypto.randomBytes(24).toString('hex')}`;
  const secretKey = `sk_${direction}_${crypto.randomBytes(32).toString('hex')}`;
  const secretKeyHash = crypto
    .createHash('sha256')
    .update(secretKey)
    .digest('hex');
  return { publicKey, secretKey, secretKeyHash };
}

async function main() {
  const passwordHash = await bcrypt.hash('admin123', 12);

  // ─── Users ───
  const owner = await prisma.user.upsert({
    where: { email: 'owner@p2p.local' },
    update: {},
    create: { email: 'owner@p2p.local', passwordHash, role: 'OWNER' },
  });

  const admin = await prisma.user.upsert({
    where: { email: 'admin@p2p.local' },
    update: {},
    create: { email: 'admin@p2p.local', passwordHash, role: 'ADMIN' },
  });

  const support = await prisma.user.upsert({
    where: { email: 'support@p2p.local' },
    update: {},
    create: { email: 'support@p2p.local', passwordHash, role: 'SUPPORT' },
  });

  const traderUser = await prisma.user.upsert({
    where: { email: 'trader@p2p.local' },
    update: {},
    create: { email: 'trader@p2p.local', passwordHash, role: 'TRADER' },
  });

  const merchantUser = await prisma.user.upsert({
    where: { email: 'merchant@p2p.local' },
    update: {},
    create: { email: 'merchant@p2p.local', passwordHash, role: 'MERCHANT' },
  });

  const referralUser = await prisma.user.upsert({
    where: { email: 'referral@p2p.local' },
    update: {},
    create: { email: 'referral@p2p.local', passwordHash, role: 'REFERRAL' },
  });

  // ─── Referral Profile ───
  const referralProfile = await (prisma as any).referralProfile.upsert({
    where: { userId: referralUser.id },
    update: {},
    create: {
      userId: referralUser.id,
      referralPercent: 5,
      currency: 'UAH',
    },
  });

  // ─── Trader Profile & Balance ───
  const traderProfile = await prisma.traderProfile.upsert({
    where: { userId: traderUser.id },
    update: {},
    create: {
      userId: traderUser.id,
      payoutMinLimit: 100,
      payoutMaxLimit: 20000,
    },
  });

  await prisma.traderBalance.upsert({
    where: { traderId_currency: { traderId: traderProfile.id, currency: 'UAH' } },
    update: {},
    create: { traderId: traderProfile.id, currency: 'UAH', amount: 50000 },
  });

  await prisma.traderBalance.upsert({
    where: { traderId_currency: { traderId: traderProfile.id, currency: 'USDT' } },
    update: {},
    create: { traderId: traderProfile.id, currency: 'USDT', amount: 1000 },
  });

  // ─── Merchant & Balance ───
  const merchant = await prisma.merchant.upsert({
    where: { userId: merchantUser.id },
    update: {},
    create: { userId: merchantUser.id, name: 'Test Merchant' },
  });

  await prisma.merchantBalance.upsert({
    where: { merchantId_currency: { merchantId: merchant.id, currency: 'USDT' } },
    update: {},
    create: { merchantId: merchant.id, currency: 'USDT', amount: 10000 },
  });

  await prisma.merchantBalance.upsert({
    where: { merchantId_currency: { merchantId: merchant.id, currency: 'UAH' } },
    update: {},
    create: { merchantId: merchant.id, currency: 'UAH', amount: 500000 },
  });

  // ─── API Keys (matches HMAC guard - SHA-256 hash of secret) ───
  const existingPayinKey = await prisma.merchantApiKey.findFirst({
    where: { merchantId: merchant.id, direction: 'PAYIN', isActive: true },
  });

  let payinKeys: { publicKey: string; secretKey: string };
  if (!existingPayinKey) {
    const keys = generateApiKey('payin');
    await prisma.merchantApiKey.create({
      data: {
        merchantId: merchant.id,
        direction: 'PAYIN',
        publicKey: keys.publicKey,
        secretKeyHash: keys.secretKeyHash,
      },
    });
    payinKeys = { publicKey: keys.publicKey, secretKey: keys.secretKey };
  } else {
    payinKeys = { publicKey: existingPayinKey.publicKey, secretKey: '(already exists — not regenerated)' };
  }

  const existingPayoutKey = await prisma.merchantApiKey.findFirst({
    where: { merchantId: merchant.id, direction: 'PAYOUT', isActive: true },
  });

  let payoutKeys: { publicKey: string; secretKey: string };
  if (!existingPayoutKey) {
    const keys = generateApiKey('payout');
    await prisma.merchantApiKey.create({
      data: {
        merchantId: merchant.id,
        direction: 'PAYOUT',
        publicKey: keys.publicKey,
        secretKeyHash: keys.secretKeyHash,
      },
    });
    payoutKeys = { publicKey: keys.publicKey, secretKey: keys.secretKey };
  } else {
    payoutKeys = { publicKey: existingPayoutKey.publicKey, secretKey: '(already exists — not regenerated)' };
  }

  // ─── Currencies ───
  for (const code of ['UAH', 'USD', 'USDT', 'EUR', 'RUB']) {
    await prisma.currency.upsert({
      where: { code },
      update: {},
      create: { code },
    });
  }

  // ─── Countries ───
  const ukraine = await prisma.country.upsert({
    where: { code: 'UA' },
    update: {},
    create: { name: 'Ukraine', code: 'UA', currency: 'UAH' },
  });

  // ─── Payment Methods ───
  const cardP2P = await prisma.paymentMethod.upsert({
    where: { name: 'CARD_P2P' },
    update: {},
    create: {
      countryId: ukraine.id,
      name: 'CARD_P2P',
      displayName: 'Картка P2P',
      flowType: 'P2P',
      requisiteType: 'CARD',
      availability: 'BOTH',
    },
  });

  const ibanP2P = await prisma.paymentMethod.upsert({
    where: { name: 'IBAN_P2P' },
    update: {},
    create: {
      countryId: ukraine.id,
      name: 'IBAN_P2P',
      displayName: 'IBAN P2P',
      flowType: 'P2P',
      requisiteType: 'IBAN',
      availability: 'PAYIN',
    },
  });
  void ibanP2P;

  // ─── Merchant Directions + Commission Tiers ───
  const payinDir = await prisma.merchantDirection.upsert({
    where: {
      merchantId_directionType_currency: {
        merchantId: merchant.id,
        directionType: 'PAYIN',
        currency: 'UAH',
      },
    },
    update: {},
    create: {
      merchantId: merchant.id,
      paymentMethodId: cardP2P.id,
      directionType: 'PAYIN',
      currency: 'UAH',
      minAmount: 100,
      maxAmount: 50000,
      defaultCommissionPercent: 5,
    },
  });

  // Tiered commission: up to 10k = 5%, 10k–50k = 4%
  const existingTiers = await prisma.merchantCommissionTier.count({
    where: { merchantDirectionId: payinDir.id },
  });
  if (existingTiers === 0) {
    await prisma.merchantCommissionTier.createMany({
      data: [
        { merchantDirectionId: payinDir.id, amountFrom: 0, amountTo: 10000, commissionPercent: 5 },
        { merchantDirectionId: payinDir.id, amountFrom: 10001, amountTo: null, commissionPercent: 4 },
      ],
    });
  }

  // ─── Directions (idempotent) ───
  const directions = [
    { name: 'PayIn UAH → USDT', type: 'PAYIN' as const, fromCurrency: 'UAH', toCurrency: 'USDT', minAmount: 100, maxAmount: 50000, rate: 0.024, percentFee: 5 },
    { name: 'PayOut USDT → UAH', type: 'PAYOUT' as const, fromCurrency: 'USDT', toCurrency: 'UAH', minAmount: 10, maxAmount: 5000, rate: 41.5, percentFee: 3 },
  ];

  for (const d of directions) {
    const existing = await prisma.direction.findFirst({
      where: { type: d.type, fromCurrency: d.fromCurrency, toCurrency: d.toCurrency },
    });
    if (!existing) {
      await prisma.direction.create({ data: { ...d, isOnline: true } });
    }
  }

  // ─── Banks ───
  const banks = ['Monobank', 'PrivatBank', 'PUMB', 'Oshchadbank', 'Sportbank'];
  const bankRecords: Record<string, { id: number }> = {};
  for (let i = 0; i < banks.length; i++) {
    const bank = await prisma.bank.upsert({
      where: { id: i + 1 },
      update: {},
      create: { name: banks[i] },
    });
    bankRecords[banks[i]] = bank;
  }

  // ─── Requisites (idempotent) ───
  const existingReqs = await prisma.requisite.count({ where: { traderId: traderProfile.id } });
  if (existingReqs === 0) {
    await prisma.requisite.createMany({
      data: [
        {
          traderId: traderProfile.id,
          type: 'CARD',
          number: '5375411234567890',
          owner: 'Test Trader',
          bankId: bankRecords['Monobank'].id,
          currency: 'UAH',
          minAmount: 100,
          maxAmount: 50000,
          limitTotalAmount: 500000,
          limitTotalOps: 100,
        },
        {
          traderId: traderProfile.id,
          type: 'CARD',
          number: '4149629876543210',
          owner: 'Test Trader',
          bankId: bankRecords['PrivatBank'].id,
          currency: 'UAH',
          minAmount: 200,
          maxAmount: 30000,
          limitTotalAmount: 300000,
          limitTotalOps: 50,
        },
      ],
    });
  }

  // ─── Telegram Settings ───
  await prisma.telegramSettings.upsert({
    where: { traderId: traderProfile.id },
    update: {},
    create: {
      traderId: traderProfile.id,
      notifyPayin: true,
      notifyPayout: true,
      notifyAppeals: true,
    },
  });

  // ─── Sample Pay-In Orders ───
  const existingPayins = await prisma.payinOrder.count({ where: { merchantId: merchant.id } });
  if (existingPayins === 0) {
    const requisite = await prisma.requisite.findFirst({ where: { traderId: traderProfile.id } });
    const statuses = ['PAID', 'NEW', 'VERIFIED', 'CANCELED', 'PAID', 'PAID'] as const;
    for (let i = 0; i < statuses.length; i++) {
      await prisma.payinOrder.create({
        data: {
          requestId: `test-payin-${i + 1}`,
          merchantId: merchant.id,
          traderId: traderProfile.id,
          requisiteId: requisite?.id,
          amount: 1000 + i * 500,
          currency: 'UAH',
          commission: (1000 + i * 500) * 0.05,
          partnerAmount: (1000 + i * 500) * 0.024,
          rate: 0.024,
          status: statuses[i],
          autocloseAt: new Date(Date.now() + 30 * 60 * 1000),
        },
      });
    }
  }

  // ─── Link trader to referral agent ───
  await prisma.user.update({
    where: { id: traderUser.id },
    data: { referredById: referralProfile.id },
  });

  // ─── Sample Pay-Out Orders ───
  const existingPayouts = await prisma.payoutOrder.count({ where: { merchantId: merchant.id } });
  if (existingPayouts === 0) {
    // Assigned orders (have a trader)
    const assignedStatuses = ['COMPLETED', 'NEW', 'PROCESSING'] as const;
    for (let i = 0; i < assignedStatuses.length; i++) {
      await prisma.payoutOrder.create({
        data: {
          requestId: `test-payout-${i + 1}`,
          merchantId: merchant.id,
          traderId: traderProfile.id,
          amount: 500 + i * 250,
          currency: 'UAH',
          status: assignedStatuses[i],
          detailsType: 'CARD',
          detailsNumber: '5375411234567890',
          detailsOwner: 'Recipient Name',
          rate: 1,
          partnerAmount: (500 + i * 250) * 0.97,
          percentFee: 3,
        },
      });
    }

    // Pool orders — PENDING with no traderId (visible to traders in pool)
    const poolAmounts = [1000, 5000, 12000, 18000, 25000];
    for (let i = 0; i < poolAmounts.length; i++) {
      await prisma.payoutOrder.create({
        data: {
          requestId: `test-payout-pool-${i + 1}`,
          merchantId: merchant.id,
          traderId: null,
          amount: poolAmounts[i],
          currency: 'UAH',
          status: 'PENDING',
          detailsType: 'CARD',
          detailsNumber: '4149629876543210',
          detailsOwner: 'Pool Recipient',
          rate: 1,
          partnerAmount: poolAmounts[i] * 0.97,
          percentFee: 3,
        },
      });
    }
  }

  console.log('');
  console.log('=== Seed Complete ===');
  console.log('');
  console.log('Test accounts (password: admin123):');
  console.log('  Owner:    owner@p2p.local');
  console.log('  Admin:    admin@p2p.local');
  console.log('  Support:  support@p2p.local');
  console.log('  Trader:   trader@p2p.local    (payout limits: 100–20000 UAH)');
  console.log('  Merchant: merchant@p2p.local');
  console.log('  Referral: referral@p2p.local  (5% commission, trader linked)');
  console.log('');
  console.log('Geo/Payment: Ukraine (UA/UAH) → CARD_P2P (Both), IBAN_P2P (PayIn)');
  console.log('Merchant dir: PAYIN/UAH, tiers: 0–10k=5%, 10k+=4%');
  console.log('');
  console.log('Pay-In API Key:  ', payinKeys.publicKey);
  console.log('Pay-In Secret:   ', payinKeys.secretKey);
  console.log('Pay-Out API Key: ', payoutKeys.publicKey);
  console.log('Pay-Out Secret:  ', payoutKeys.secretKey);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
