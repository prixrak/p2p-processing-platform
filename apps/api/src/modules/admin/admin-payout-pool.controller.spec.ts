import { NotFoundException } from '@nestjs/common';
import { AdminPayoutPoolController } from './admin-payout-pool.controller';

describe('AdminPayoutPoolController', () => {
  const merchantId = '550e8400-e29b-41d4-a716-446655440099';

  function createController(prisma: any) {
    return new AdminPayoutPoolController(prisma as any);
  }

  describe('upsertMerchantAssignment', () => {
    it('resolves merchant by exact display name and upserts assignment', async () => {
      const prisma = {
        merchant: {
          findUnique: jest.fn().mockResolvedValue({ id: merchantId, name: 'Acme Ltd' }),
          findMany: jest.fn(),
        },
        merchantPayoutPoolAssignment: {
          upsert: jest.fn().mockResolvedValue({
            id: 'asg-1',
            merchantId,
            poolBPercent: 12,
            isActive: true,
          }),
        },
      };
      const c = createController(prisma);
      const result = await c.upsertMerchantAssignment(
        {
          merchant_display_name: ' Acme Ltd ',
          pool_b_percent: 12,
          is_active: true,
        },
        'user-1',
      );

      expect(prisma.merchant.findUnique).toHaveBeenCalledWith({
        where: { name: 'Acme Ltd' },
      });
      expect(prisma.merchantPayoutPoolAssignment.upsert).toHaveBeenCalled();
      expect(result.merchant_display_name).toBe('Acme Ltd');
      expect(result.merchant_id).toBe(merchantId);
    });

    it('throws when display name does not exist', async () => {
      const prisma = {
        merchant: {
          findUnique: jest.fn().mockResolvedValue(null),
          findMany: jest.fn(),
        },
        merchantPayoutPoolAssignment: { upsert: jest.fn() },
      };
      const c = createController(prisma);

      await expect(
        c.upsertMerchantAssignment(
          { merchant_display_name: 'Unknown', pool_b_percent: 5 },
          'user-1',
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.merchantPayoutPoolAssignment.upsert).not.toHaveBeenCalled();
    });
  });

  describe('searchMerchantDirectory', () => {
    it('returns first 50 active unlocked merchants when query is blank', async () => {
      const prisma = {
        merchant: {
          findUnique: jest.fn(),
          findMany: jest.fn().mockResolvedValue([{ id: merchantId, name: 'Zed' }]),
        },
        merchantPayoutPoolAssignment: { upsert: jest.fn() },
      };
      const c = createController(prisma);
      await expect(c.searchMerchantDirectory('  ')).resolves.toEqual({
        items: [{ merchant_id: merchantId, display_name: 'Zed' }],
      });
      expect(prisma.merchant.findMany).toHaveBeenCalledWith({
        where: { isLock: false, user: { isActive: true } },
        select: { id: true, name: true },
        take: 50,
        orderBy: { name: 'asc' },
      });
    });

    it('filters by name when query is non-empty', async () => {
      const prisma = {
        merchant: {
          findUnique: jest.fn(),
          findMany: jest.fn().mockResolvedValue([]),
        },
        merchantPayoutPoolAssignment: { upsert: jest.fn() },
      };
      const c = createController(prisma);
      await c.searchMerchantDirectory(' ac ');
      expect(prisma.merchant.findMany).toHaveBeenCalledWith({
        where: {
          isLock: false,
          user: { isActive: true },
          name: { contains: 'ac', mode: 'insensitive' },
        },
        select: { id: true, name: true },
        take: 50,
        orderBy: { name: 'asc' },
      });
    });
  });
});
