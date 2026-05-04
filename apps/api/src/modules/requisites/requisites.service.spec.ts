import { BadRequestException } from '@nestjs/common';
import { RequisiteType } from '@p2p/shared';
import type { PrismaService } from '../../config/prisma.service';
import type { CascadeService } from '../cascade/cascade.service';
import type { CascadeRedisStateService } from '../cascade/cascade-redis-state.service';
import type { ExchangeRateService } from '../exchange-rate/exchange-rate.service';
import { CreateRequisiteDto } from './dto/create-requisite.dto';
import { RequisitesService } from './requisites.service';

describe('RequisitesService.create', () => {
  const traderId = '11111111-1111-1111-1111-111111111111';
  const groupId = '22222222-2222-2222-2222-222222222222';
  const currencyId = '33333333-3333-3333-3333-333333333333';

  function svc(prisma: PrismaService) {
    return new RequisitesService(
      prisma,
      {} as CascadeService,
      {} as ExchangeRateService,
      { invalidateCurrency: jest.fn() } as unknown as CascadeRedisStateService,
    );
  }

  const baseDto: CreateRequisiteDto = {
    groupId,
    type: RequisiteType.CARD,
    number: '4111111111111111',
    owner: 'Jane Doe',
    bankId: 1,
  };

  it('rejects when bank is missing or inactive', async () => {
    const prisma = {
      requisiteGroup: {
        findFirst: jest.fn().mockResolvedValue({
          id: groupId,
          traderId,
          archivedAt: null,
          currencyId,
        }),
      },
      bank: { findFirst: jest.fn().mockResolvedValue(null) },
      requisite: { create: jest.fn() },
    } as unknown as PrismaService;

    await expect(svc(prisma).create(traderId, baseDto)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.requisite.create).not.toHaveBeenCalled();
  });

  it('creates requisite when group exists and bank is active', async () => {
    const prisma = {
      requisiteGroup: {
        findFirst: jest.fn().mockResolvedValue({
          id: groupId,
          traderId,
          archivedAt: null,
          currencyId,
        }),
      },
      bank: {
        findFirst: jest.fn().mockResolvedValue({ id: 1, name: 'TestBank', isActive: true }),
      },
      requisite: {
        create: jest.fn().mockResolvedValue({
          currency: { code: 'UAH' },
          bank: {},
          group: {},
        }),
      },
    } as unknown as PrismaService;

    await svc(prisma).create(traderId, baseDto);

    expect(prisma.requisite.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          traderId,
          requisiteGroupId: groupId,
          bankId: 1,
          currencyId,
        }),
      }),
    );
  });
});
