import { BadRequestException, NotFoundException } from '@nestjs/common';
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

  describe('patchMerchantAssignment', () => {
    it('throws BadRequestException when nothing to update', async () => {
      const prisma = {};
      const c = createController(prisma as any);
      await expect(c.patchMerchantAssignment(merchantId, {} as any)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('updates assignment when merchant has a row', async () => {
      const prisma = {
        merchantPayoutPoolAssignment: {
          findUnique: jest.fn().mockResolvedValue({
            merchantId,
            merchant: { name: 'Acme Ltd' },
          }),
          update: jest.fn().mockResolvedValue({
            id: 'asg-1',
            merchantId,
            poolBPercent: 40,
            isActive: false,
            merchant: { id: merchantId, name: 'Acme Ltd' },
          }),
        },
      };
      const c = createController(prisma);
      const result = await c.patchMerchantAssignment(merchantId, {
        pool_b_percent: 40,
        is_active: false,
      });
      expect(result.pool_b_percent).toBe(40);
      expect(result.is_active).toBe(false);
    });

    it('throws when merchant has no assignment', async () => {
      const prisma = {
        merchantPayoutPoolAssignment: {
          findUnique: jest.fn().mockResolvedValue(null),
          update: jest.fn(),
        },
      };
      const c = createController(prisma);
      await expect(
        c.patchMerchantAssignment(merchantId, { pool_b_percent: 10 }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.merchantPayoutPoolAssignment.update).not.toHaveBeenCalled();
    });
  });

  describe('deleteMerchantAssignment', () => {
    it('throws when merchant has no assignment', async () => {
      const prisma = {
        merchantPayoutPoolAssignment: {
          findUnique: jest.fn().mockResolvedValue(null),
          delete: jest.fn(),
        },
      };
      const c = createController(prisma);
      await expect(c.deleteMerchantAssignment(merchantId)).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.merchantPayoutPoolAssignment.delete).not.toHaveBeenCalled();
    });

    it('deletes when row exists', async () => {
      const prisma = {
        merchantPayoutPoolAssignment: {
          findUnique: jest.fn().mockResolvedValue({ merchantId }),
          delete: jest.fn().mockResolvedValue({}),
        },
      };
      const c = createController(prisma);
      await expect(c.deleteMerchantAssignment(merchantId)).resolves.toBeUndefined();
      expect(prisma.merchantPayoutPoolAssignment.delete).toHaveBeenCalledWith({
        where: { merchantId },
      });
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
