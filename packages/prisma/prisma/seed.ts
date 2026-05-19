import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import {
  encryptMerchantApiSigningSecretForStorage,
  isMerchantSecretSha256FingerprintOnly,
} from './merchant-api-secret-storage';

const prisma = new PrismaClient();

/** Secret column must be AES-256-GCM ciphertext; HmacAuthGuard decrypts and verifies HMAC-SHA512. */
function generateApiKey(direction: 'payin' | 'payout') {
  const publicKey = `pk_${direction}_${crypto.randomBytes(24).toString('hex')}`;
  const secretKey = `sk_${direction}_${crypto.randomBytes(32).toString('hex')}`;
  const secretKeyHash = encryptMerchantApiSigningSecretForStorage(secretKey);
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

  for (const code of ['UAH', 'USD', 'USDT', 'EUR', 'RUB']) {
    await prisma.currency.upsert({
      where: { code },
      update: {},
      create: { code },
    });
  }

  const uahRow = await prisma.currency.findUniqueOrThrow({ where: { code: 'UAH' } });
  const usdtRow = await prisma.currency.findUniqueOrThrow({ where: { code: 'USDT' } });

  // ─── Referral Profile ───
  const referralProfile = await prisma.referralProfile.upsert({
    where: { userId: referralUser.id },
    update: {},
    create: {
      userId: referralUser.id,
      referralPercent: 5,
      currencyId: uahRow.id,
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
    where: { traderId_currencyId: { traderId: traderProfile.id, currencyId: uahRow.id } },
    update: {},
    create: { traderId: traderProfile.id, currencyId: uahRow.id, amount: 50000 },
  });

  await prisma.traderBalance.upsert({
    where: { traderId_currencyId: { traderId: traderProfile.id, currencyId: usdtRow.id } },
    update: {},
    create: { traderId: traderProfile.id, currencyId: usdtRow.id, amount: 1000 },
  });

  // ─── Merchant & Balance ───
  const merchant = await prisma.merchant.upsert({
    where: { userId: merchantUser.id },
    update: {},
    create: { userId: merchantUser.id, name: 'Test Merchant' },
  });

  await prisma.merchantBalance.upsert({
    where: { merchantId_currencyId: { merchantId: merchant.id, currencyId: usdtRow.id } },
    update: {},
    create: { merchantId: merchant.id, currencyId: usdtRow.id, amount: 10000 },
  });

  await prisma.merchantBalance.upsert({
    where: { merchantId_currencyId: { merchantId: merchant.id, currencyId: uahRow.id } },
    update: {},
    create: { merchantId: merchant.id, currencyId: uahRow.id, amount: 500000 },
  });

  // ─── API Keys (encrypted at rest — same codec as MerchantService / HmacAuthGuard) ───
  let existingPayinKey = await prisma.merchantApiKey.findFirst({
    where: { merchantId: merchant.id, direction: 'PAYIN', isActive: true },
  });
  let existingPayoutKey = await prisma.merchantApiKey.findFirst({
    where: { merchantId: merchant.id, direction: 'PAYOUT', isActive: true },
  });

  const mustReplaceUndecryptableMerchantKeys =
    (existingPayinKey != null && isMerchantSecretSha256FingerprintOnly(existingPayinKey.secretKeyHash)) ||
    (existingPayoutKey != null && isMerchantSecretSha256FingerprintOnly(existingPayoutKey.secretKeyHash));

  if (mustReplaceUndecryptableMerchantKeys) {
    console.warn(
      '[seed] Removing undecryptable merchant API keys (SHA256-only fingerprints). Recreating encrypted keys.',
    );
    await prisma.merchantApiKey.deleteMany({ where: { merchantId: merchant.id } });
    existingPayinKey = null;
    existingPayoutKey = null;
  }

  let payinKeys: { publicKey: string; secretKey: string };
  let payoutKeys: { publicKey: string; secretKey: string };

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
    payinKeys = {
      publicKey: existingPayinKey.publicKey,
      secretKey: '(unchanged — regenerate from admin cabinet if lost)',
    };
  }

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
    payoutKeys = {
      publicKey: existingPayoutKey.publicKey,
      secretKey: '(unchanged — regenerate from admin cabinet if lost)',
    };
  }


  // ─── Countries ───
  const ukraine = await prisma.country.upsert({
    where: { code: 'UA' },
    update: {},
    create: { name: 'Ukraine', code: 'UA', currencyId: uahRow.id },
  });

  // ─── Pay-Out specialist user (pool B cabinet) ───
  const payoutCabinetUser = await prisma.user.upsert({
    where: { email: 'payout@p2p.local' },
    update: {},
    create: {
      email: 'payout@p2p.local',
      passwordHash,
      role: 'PAYOUT_TRADER',
    },
  });

  const payoutTraderProfileSeed = await prisma.payoutTraderProfile.upsert({
    where: { userId: payoutCabinetUser.id },
    update: { countryId: ukraine.id },
    create: {
      userId: payoutCabinetUser.id,
      countryId: ukraine.id,
      payoutRate: 0,
      balanceUsdt: 500,
    },
  });

  await prisma.payoutTraderTelegramSettings.upsert({
    where: { payoutTraderId: payoutTraderProfileSeed.id },
    update: {},
    create: {
      payoutTraderId: payoutTraderProfileSeed.id,
      notifyNewPoolOrder: true,
      notifySettlement: true,
    },
  });

  // ─── Payment Methods ───
  const cardP2P = await prisma.paymentMethod.upsert({
    where: { name: 'CARD_P2P' },
    update: {},
    create: {
      countryId: ukraine.id,
      name: 'CARD_P2P',
      displayName: 'P2P card',
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
      merchantId_directionType_currencyId: {
        merchantId: merchant.id,
        directionType: 'PAYIN',
        currencyId: uahRow.id,
      },
    },
    update: {},
    create: {
      merchantId: merchant.id,
      paymentMethodId: cardP2P.id,
      directionType: 'PAYIN',
      currencyId: uahRow.id,
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
    {
      name: 'PayIn UAH → USDT',
      type: 'PAYIN' as const,
      fromCurrencyId: uahRow.id,
      toCurrencyId: usdtRow.id,
      minAmount: 100,
      maxAmount: 50000,
      percentFee: 5,
    },
    {
      name: 'PayOut USDT → UAH',
      type: 'PAYOUT' as const,
      fromCurrencyId: usdtRow.id,
      toCurrencyId: uahRow.id,
      minAmount: 10,
      maxAmount: 5000,
      percentFee: 3,
    },
  ];

  for (const d of directions) {
    const existing = await prisma.direction.findFirst({
      where: {
        type: d.type,
        fromCurrencyId: d.fromCurrencyId,
        toCurrencyId: d.toCurrencyId,
      },
    });
    if (!existing) {
      await prisma.direction.create({
        data: {
          name: d.name,
          type: d.type,
          fromCurrencyId: d.fromCurrencyId,
          toCurrencyId: d.toCurrencyId,
          minAmount: d.minAmount,
          maxAmount: d.maxAmount,
          percentFee: d.percentFee,
          isOnline: true,
        },
      });
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
    const seedGroup = await prisma.requisiteGroup.create({
      data: {
        traderId: traderProfile.id,
        name: 'Seed UAH',
        currencyId: uahRow.id,
        paymentMethodId: cardP2P.id,
      },
    });
    await prisma.requisite.createMany({
      data: [
        {
          traderId: traderProfile.id,
          requisiteGroupId: seedGroup.id,
          type: 'CARD',
          number: '5375411234567890',
          numberNormalized: '5375411234567890',
          owner: 'Test Trader',
          cardHolderName: 'Petrenko Ivan Oleksiyovych',
          bankId: bankRecords['Monobank'].id,
          currencyId: uahRow.id,
          minAmount: 100,
          maxAmount: 50000,
          limitTotalAmount: 500000,
          limitTotalOps: 100,
        },
        {
          traderId: traderProfile.id,
          requisiteGroupId: seedGroup.id,
          type: 'CARD',
          number: '4149629876543210',
          numberNormalized: '4149629876543210',
          owner: 'Test Trader',
          cardHolderName: 'Kovalenko Maria Petrivna',
          bankId: bankRecords['PrivatBank'].id,
          currencyId: uahRow.id,
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
          currencyId: uahRow.id,
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
          currencyId: uahRow.id,
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
          currencyId: uahRow.id,
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
  console.log('  Trader:         trader@p2p.local    (payout limits: 100–20000 UAH)');
  console.log('  Pay-Out spec.:  payout@p2p.local   (pool B specialist, UA, 500 USDT)');
  console.log('  Merchant:       merchant@p2p.local');
  console.log('  Referral:       referral@p2p.local  (5% commission, trader linked)');
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
