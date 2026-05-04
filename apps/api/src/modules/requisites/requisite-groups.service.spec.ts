import { BadRequestException } from '@nestjs/common';
import { PaymentMethodAvailability } from '@prisma/client';
import type { PrismaService } from '../../config/prisma.service';
import type { CurrenciesService } from '../currencies/currencies.service';
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
    return new RequisiteGroupsService(prisma, cur);
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
  });
});
