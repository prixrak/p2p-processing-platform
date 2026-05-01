import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { UserRole } from '@p2p/shared';
import { UsersService } from './users.service';

describe('UsersService', () => {
  const userId = '550e8400-e29b-41d4-a716-446655440000';

  const ownerRow = {
    id: userId,
    email: 'owner@example.com',
    role: UserRole.OWNER,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const adminRow = {
    id: userId,
    email: 'admin@example.com',
    role: UserRole.ADMIN,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  function createService() {
    const prisma = {
      user: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        groupBy: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      traderProfile: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
      },
      referralProfile: {
        upsert: jest.fn(),
      },
      merchant: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
      },
      payoutTraderProfile: {},
      country: { findUnique: jest.fn() },
    };
    const traderWallets = { ensureProvisioned: jest.fn() };
    const service = new UsersService(prisma as any, traderWallets as any);
    return { service, prisma, traderWallets };
  }

  describe('findAll', () => {
    it('owner viewer hides owner accounts and applies filters', async () => {
      const { service, prisma } = createService();
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.groupBy.mockResolvedValue([{ role: UserRole.ADMIN, _count: { _all: 10 } }]);
      prisma.user.count.mockResolvedValueOnce(10).mockResolvedValueOnce(6).mockResolvedValueOnce(4);

      const res = await service.findAll(
        {
          page: 1,
          limit: 20,
          search: 'test',
          role: UserRole.ADMIN,
        } as any,
        UserRole.OWNER,
      );

      expect(res.total).toBe(10);
      expect(res.stats.activeCount).toBe(6);
      expect(res.stats.inactiveCount).toBe(4);
      expect(res.stats.byRole[UserRole.ADMIN]).toBe(10);
      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            AND: expect.arrayContaining([
              { role: { not: UserRole.OWNER } },
              { email: { contains: 'test', mode: 'insensitive' } },
              { role: UserRole.ADMIN },
            ]),
          },
        }),
      );
    });

    it('admin viewer hides owner and admin accounts', async () => {
      const { service, prisma } = createService();
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.groupBy.mockResolvedValue([{ role: UserRole.TRADER, _count: { _all: 5 } }]);
      prisma.user.count.mockResolvedValueOnce(5).mockResolvedValueOnce(3).mockResolvedValueOnce(2);

      await service.findAll({ page: 1, limit: 20 } as any, UserRole.ADMIN);

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            AND: expect.arrayContaining([
              { role: { notIn: [UserRole.OWNER, UserRole.ADMIN] } },
            ]),
          },
        }),
      );
    });
  });

  describe('create', () => {
    it('creates nested merchant when role is MERCHANT', async () => {
      const { service, prisma } = createService();
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({
        id: userId,
        email: 'm@example.com',
        role: UserRole.MERCHANT,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await service.create('m@example.com', 'password12345', UserRole.MERCHANT, {
        merchantName: 'Shop Co',
      });

      expect(prisma.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          email: 'm@example.com',
          role: UserRole.MERCHANT,
          merchant: { create: { name: 'Shop Co' } },
        }),
        select: expect.any(Object),
      });
    });

    it('rejects MERCHANT without merchantName', async () => {
      const { service, prisma } = createService();
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(
        service.create('m@example.com', 'password12345', UserRole.MERCHANT, {}),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.user.create).not.toHaveBeenCalled();
    });
  });

  describe('deactivate', () => {
    it('rejects OWNER', async () => {
      const { service, prisma } = createService();
      prisma.user.findUnique.mockResolvedValue(ownerRow);

      await expect(service.deactivate(userId)).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('deactivates non-owner', async () => {
      const { service, prisma } = createService();
      prisma.user.findUnique.mockResolvedValue(adminRow);
      prisma.user.update.mockResolvedValue({ ...adminRow, isActive: false });

      await service.deactivate(userId);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: { isActive: false },
        select: expect.any(Object),
      });
    });
  });

  describe('update', () => {
    it('rejects isActive false for OWNER', async () => {
      const { service, prisma } = createService();
      prisma.user.findUnique.mockResolvedValue(ownerRow);

      await expect(service.update(userId, { isActive: false })).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('allows other patches for OWNER', async () => {
      const { service, prisma } = createService();
      prisma.user.findUnique.mockResolvedValue(ownerRow);
      prisma.user.update.mockResolvedValue({ ...ownerRow, email: 'new@example.com' });

      await service.update(userId, { email: 'new@example.com' });

      expect(prisma.user.update).toHaveBeenCalled();
    });

    it('ensures referral profile when role becomes REFERRAL', async () => {
      const { service, prisma } = createService();
      prisma.referralProfile.upsert.mockResolvedValue({});
      prisma.user.findUnique.mockResolvedValue(adminRow);
      prisma.user.update.mockResolvedValue({ ...adminRow, role: UserRole.REFERRAL });

      await service.update(userId, { role: UserRole.REFERRAL });

      expect(prisma.referralProfile.upsert).toHaveBeenCalledWith({
        where: { userId },
        create: { userId, referralPercent: 0, currency: 'UAH' },
        update: {},
      });
    });
  });
});
