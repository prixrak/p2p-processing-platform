import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PaymentMethodAvailability, RequisiteDisabledReason } from '@prisma/client';
import type { PrismaService } from '../../config/prisma.service';
import type { CurrenciesService } from '../currencies/currencies.service';
import type { CascadeRedisStateService } from '../cascade/cascade-redis-state.service';
import { CreateRequisiteGroupDto } from './dto/create-requisite-group.dto';
import { UpdateRequisiteGroupDto } from './dto/update-requisite-group.dto';
import { RequisiteGroupsService } from './requisite-groups.service';

describe('RequisiteGroupsService', () => {
  const traderId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const currencyId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  const pmId = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  const groupId = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

  function service(prisma: PrismaService, currencies?: Partial<CurrenciesService>) {
    const cur = {
      requireActiveCurrencyIdByCode: jest.fn().mockResolvedValue(currencyId),
      ...currencies,
    } as CurrenciesService;
    const cascade = {
      invalidateCurrency: jest.fn().mockResolvedValue(undefined),
    } as unknown as CascadeRedisStateService;
    return new RequisiteGroupsService(prisma, cur, cascade);
  }

  describe('create', () => {
    const dto: CreateRequisiteGroupDto = {
      name: 'Cards',
      currency: 'UAH',
      paymentMethodId: pmId,
    };

    it('rejects invalid Pay-In payment method for currency', async () => {
      const prisma = {
        paymentMethod: {
          findFirst: jest.fn().mockResolvedValue(null),
        },
        requisiteGroup: { create: jest.fn() },
      } as unknown as PrismaService;

      await expect(service(prisma).create(traderId, dto)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.requisiteGroup.create).not.toHaveBeenCalled();
      expect(prisma.paymentMethod.findFirst).toHaveBeenCalledWith({
        where: {
          id: pmId,
          isActive: true,
          availability: {
            in: [PaymentMethodAvailability.PAYIN, PaymentMethodAvailability.BOTH],
          },
          country: { currencyId },
        },
        select: { id: true },
      });
    });

    it('creates group when payment method matches currency', async () => {
      const prisma = {
        paymentMethod: {
          findFirst: jest.fn().mockResolvedValue({ id: pmId }),
        },
        requisiteGroup: {
          create: jest.fn().mockResolvedValue({
            paymentMethod: {},
          }),
        },
      } as unknown as PrismaService;

      await service(prisma).create(traderId, dto);

      expect(prisma.requisiteGroup.create).toHaveBeenCalledWith({
        data: {
          traderId,
          name: 'Cards',
          currencyId,
          paymentMethodId: pmId,
        },
        include: {
          paymentMethod: { select: { id: true, displayName: true, name: true } },
        },
      });
    });
  });

  describe('update', () => {
    it('rejects clearing payment method', async () => {
      const prisma = {
        requisiteGroup: {
          findFirst: jest.fn().mockResolvedValue({
            id: groupId,
            traderId,
            currencyId,
            currency: { code: 'UAH' },
          }),
          update: jest.fn(),
        },
      } as unknown as PrismaService;

      const dto: UpdateRequisiteGroupDto = { paymentMethodId: null };
      await expect(service(prisma).update(traderId, groupId, dto)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.requisiteGroup.update).not.toHaveBeenCalled();
    });

    it('deactivates active requisites when the group is turned off', async () => {
      const updateMany = jest.fn().mockResolvedValue({ count: 1 });
      const groupUpdate = jest.fn().mockResolvedValue({
        id: groupId,
        paymentMethod: {},
      });
      const prisma = {
        requisiteGroup: {
          findFirst: jest.fn().mockResolvedValue({
            id: groupId,
            traderId,
            currencyId,
            currency: { code: 'UAH' },
          }),
          update: groupUpdate,
        },
        requisite: { updateMany },
        $transaction: jest.fn(
          async (
            fn: (tx: {
              requisite: { updateMany: typeof updateMany };
              requisiteGroup: { update: typeof groupUpdate };
            }) => Promise<unknown>,
          ) =>
            fn({
              requisite: { updateMany },
              requisiteGroup: { update: groupUpdate },
            }),
        ),
      } as unknown as PrismaService;

      const cascade = {
        invalidateCurrency: jest.fn().mockResolvedValue(undefined),
      } as unknown as CascadeRedisStateService;
      const cur = {
        requireActiveCurrencyIdByCode: jest.fn().mockResolvedValue(currencyId),
      } as unknown as CurrenciesService;

      const dto: UpdateRequisiteGroupDto = { isActive: false };
      await new RequisiteGroupsService(prisma, cur, cascade).update(traderId, groupId, dto);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(updateMany).toHaveBeenCalledWith({
        where: { requisiteGroupId: groupId, isActive: true },
        data: { isActive: false, disabledReason: RequisiteDisabledReason.MANUAL },
      });
      expect(groupUpdate).toHaveBeenCalledWith({
        where: { id: groupId },
        data: expect.objectContaining({
          isActive: false,
          deactivatedAt: expect.any(Date) as Date,
        }),
        include: {
          paymentMethod: { select: { id: true, displayName: true, name: true } },
        },
      });
      expect(cascade.invalidateCurrency).toHaveBeenCalledWith('UAH');
    });

    it('does not bulk-activate requisites when the group is turned on', async () => {
      const prisma = {
        requisiteGroup: {
          findFirst: jest.fn().mockResolvedValue({
            id: groupId,
            traderId,
            currencyId,
            currency: { code: 'UAH' },
          }),
          update: jest.fn().mockResolvedValue({
            id: groupId,
            paymentMethod: {},
          }),
        },
        requisite: { updateMany: jest.fn() },
        $transaction: jest.fn(),
      } as unknown as PrismaService;

      const dto: UpdateRequisiteGroupDto = { isActive: true };
      await service(prisma).update(traderId, groupId, dto);

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.requisite.updateMany).not.toHaveBeenCalled();
      expect(prisma.requisiteGroup.update).toHaveBeenCalledWith({
        where: { id: groupId },
        data: expect.objectContaining({
          isActive: true,
          deactivatedAt: null,
          archivedAt: null,
        }),
        include: {
          paymentMethod: { select: { id: true, displayName: true, name: true } },
        },
      });
    });
  });

  describe('delete (archive)', () => {
    it('rejects missing group', async () => {
      const prisma = {
        requisiteGroup: {
          findFirst: jest.fn().mockResolvedValue(null),
        },
        $transaction: jest.fn(),
      } as unknown as PrismaService;

      await expect(service(prisma).delete(traderId, groupId)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects already archived group', async () => {
      const prisma = {
        requisiteGroup: {
          findFirst: jest.fn().mockResolvedValue({
            id: groupId,
            traderId,
            archivedAt: new Date(),
            currency: { code: 'UAH' },
          }),
        },
        $transaction: jest.fn(),
      } as unknown as PrismaService;

      await expect(service(prisma).delete(traderId, groupId)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('deactivates active requisites and archives the group in one transaction', async () => {
      const updateMany = jest.fn().mockResolvedValue({ count: 2 });
      const groupUpdate = jest.fn().mockResolvedValue({});
      const prisma = {
        requisiteGroup: {
          findFirst: jest.fn().mockResolvedValue({
            id: groupId,
            traderId,
            archivedAt: null,
            currency: { code: 'UAH' },
          }),
          update: groupUpdate,
        },
        requisite: { updateMany },
        $transaction: jest.fn(async (ops: Promise<unknown>[]) => {
          await Promise.all(ops);
        }),
      } as unknown as PrismaService;

      const cascade = {
        invalidateCurrency: jest.fn().mockResolvedValue(undefined),
      } as unknown as CascadeRedisStateService;
      const cur = {
        requireActiveCurrencyIdByCode: jest.fn().mockResolvedValue(currencyId),
      } as unknown as CurrenciesService;
      await new RequisiteGroupsService(prisma, cur, cascade).delete(traderId, groupId);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(updateMany).toHaveBeenCalledWith({
        where: { requisiteGroupId: groupId, isActive: true },
        data: { isActive: false, disabledReason: RequisiteDisabledReason.MANUAL },
      });
      expect(groupUpdate).toHaveBeenCalledWith({
        where: { id: groupId },
        data: expect.objectContaining({
          isActive: false,
          archivedAt: expect.any(Date) as Date,
          deactivatedAt: expect.any(Date) as Date,
        }),
      });
      expect(cascade.invalidateCurrency).toHaveBeenCalledWith('UAH');
    });
  });
});
