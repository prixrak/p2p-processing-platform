import { BadRequestException } from '@nestjs/common';
import { DirectionType } from '@prisma/client';
import { MerchantDirectionsService } from './merchant-directions.service';

describe('MerchantDirectionsService', () => {
  const merchantId = '550e8400-e29b-41d4-a716-446655440001';
  const currencyId = '660e8400-e29b-41d4-a716-446655440002';

  function createService(prisma: { merchantDirection: { findUnique: jest.Mock } }, currencies: any) {
    return new MerchantDirectionsService(prisma as any, currencies);
  }

  describe('assertOrderAmountWithinActiveMerchantDirection', () => {
    it('does nothing when no merchant direction exists', async () => {
      const prisma = {
        merchantDirection: { findUnique: jest.fn().mockResolvedValue(null) },
      };
      const currencies = {
        requireActiveCurrencyIdByCode: jest.fn().mockResolvedValue(currencyId),
      };
      const s = createService(prisma, currencies);
      await expect(
        s.assertOrderAmountWithinActiveMerchantDirection(
          merchantId,
          DirectionType.PAYIN,
          'UAH',
          50,
        ),
      ).resolves.toBeUndefined();
    });

    it('does nothing when the merchant direction is inactive', async () => {
      const prisma = {
        merchantDirection: {
          findUnique: jest.fn().mockResolvedValue({
            isActive: false,
            minAmount: 100,
            maxAmount: 0,
          }),
        },
      };
      const currencies = {
        requireActiveCurrencyIdByCode: jest.fn().mockResolvedValue(currencyId),
      };
      const s = createService(prisma, currencies);
      await expect(
        s.assertOrderAmountWithinActiveMerchantDirection(
          merchantId,
          DirectionType.PAYIN,
          'UAH',
          50,
        ),
      ).resolves.toBeUndefined();
    });

    it('rejects when amount is below configured minimum', async () => {
      const prisma = {
        merchantDirection: {
          findUnique: jest.fn().mockResolvedValue({
            isActive: true,
            minAmount: 100,
            maxAmount: 0,
          }),
        },
      };
      const currencies = {
        requireActiveCurrencyIdByCode: jest.fn().mockResolvedValue(currencyId),
      };
      const s = createService(prisma, currencies);
      await expect(
        s.assertOrderAmountWithinActiveMerchantDirection(
          merchantId,
          DirectionType.PAYIN,
          'UAH',
          50,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects when amount is above configured maximum', async () => {
      const prisma = {
        merchantDirection: {
          findUnique: jest.fn().mockResolvedValue({
            isActive: true,
            minAmount: 0,
            maxAmount: 200,
          }),
        },
      };
      const currencies = {
        requireActiveCurrencyIdByCode: jest.fn().mockResolvedValue(currencyId),
      };
      const s = createService(prisma, currencies);
      await expect(
        s.assertOrderAmountWithinActiveMerchantDirection(
          merchantId,
          DirectionType.PAYOUT,
          'UAH',
          250,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('allows amount within [min, max]', async () => {
      const prisma = {
        merchantDirection: {
          findUnique: jest.fn().mockResolvedValue({
            isActive: true,
            minAmount: 10,
            maxAmount: 500,
          }),
        },
      };
      const currencies = {
        requireActiveCurrencyIdByCode: jest.fn().mockResolvedValue(currencyId),
      };
      const s = createService(prisma, currencies);
      await expect(
        s.assertOrderAmountWithinActiveMerchantDirection(
          merchantId,
          DirectionType.PAYIN,
          'UAH',
          100,
        ),
      ).resolves.toBeUndefined();
    });

    it('treats max amount 0 as no upper bound', async () => {
      const prisma = {
        merchantDirection: {
          findUnique: jest.fn().mockResolvedValue({
            isActive: true,
            minAmount: 1,
            maxAmount: 0,
          }),
        },
      };
      const currencies = {
        requireActiveCurrencyIdByCode: jest.fn().mockResolvedValue(currencyId),
      };
      const s = createService(prisma, currencies);
      await expect(
        s.assertOrderAmountWithinActiveMerchantDirection(
          merchantId,
          DirectionType.PAYIN,
          'UAH',
          1_000_000,
        ),
      ).resolves.toBeUndefined();
    });
  });

  describe('assertOrderAmountNotBlocked', () => {
    it('does nothing when no merchant direction exists', async () => {
      const prisma = {
        merchantDirection: { findUnique: jest.fn().mockResolvedValue(null) },
      };
      const currencies = {
        requireActiveCurrencyIdByCode: jest.fn().mockResolvedValue(currencyId),
      };
      const s = createService(prisma, currencies);
      await expect(
        s.assertOrderAmountNotBlocked(merchantId, DirectionType.PAYIN, 'UAH', 300),
      ).resolves.toBeUndefined();
    });

    it('does nothing when direction has no blocked amounts', async () => {
      const prisma = {
        merchantDirection: {
          findUnique: jest.fn().mockResolvedValue({ blockedAmounts: [] }),
        },
      };
      const currencies = {
        requireActiveCurrencyIdByCode: jest.fn().mockResolvedValue(currencyId),
      };
      const s = createService(prisma, currencies);
      await expect(
        s.assertOrderAmountNotBlocked(merchantId, DirectionType.PAYIN, 'UAH', 300),
      ).resolves.toBeUndefined();
    });

    it('rejects when amount exactly matches a blocked value', async () => {
      const prisma = {
        merchantDirection: {
          findUnique: jest.fn().mockResolvedValue({
            blockedAmounts: [{ amount: 300 }],
          }),
        },
      };
      const currencies = {
        requireActiveCurrencyIdByCode: jest.fn().mockResolvedValue(currencyId),
      };
      const s = createService(prisma, currencies);
      await expect(
        s.assertOrderAmountNotBlocked(merchantId, DirectionType.PAYIN, 'UAH', 300),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('allows amount that does not exactly match blocked values', async () => {
      const prisma = {
        merchantDirection: {
          findUnique: jest.fn().mockResolvedValue({
            blockedAmounts: [{ amount: 300 }],
          }),
        },
      };
      const currencies = {
        requireActiveCurrencyIdByCode: jest.fn().mockResolvedValue(currencyId),
      };
      const s = createService(prisma, currencies);
      await expect(
        s.assertOrderAmountNotBlocked(merchantId, DirectionType.PAYIN, 'UAH', 301),
      ).resolves.toBeUndefined();
    });
  });
});
