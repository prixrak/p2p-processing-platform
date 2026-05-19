import { BadRequestException } from '@nestjs/common';
import { Prisma, RequisiteDisabledReason } from '@prisma/client';
import { RequisiteType } from '@p2p/shared';
import type { PrismaService } from '../../config/prisma.service';
import type { CascadeService } from '../cascade/cascade.service';
import type { CascadeRedisStateService } from '../cascade/cascade-redis-state.service';
import type { ExchangeRateService } from '../exchange-rate/exchange-rate.service';
import type { AuditService } from '../audit/audit.service';
import { CreateRequisiteDto } from './dto/create-requisite.dto';
import { RequisitesService } from './requisites.service';

const auditStub = { log: jest.fn() } as unknown as AuditService;

describe('RequisitesService.activate', () => {
  const requisiteId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

  function svc(prisma: PrismaService) {
    return new RequisitesService(
      prisma,
      {} as CascadeService,
      {} as ExchangeRateService,
      { invalidateCurrency: jest.fn() } as unknown as CascadeRedisStateService,
      auditStub,
    );
  }

  it('rejects when payment group is inactive', async () => {
    const prisma = {
      requisite: {
        findUnique: jest.fn().mockResolvedValue({
          id: requisiteId,
          traderId: 't',
          type: RequisiteType.CARD,
          numberNormalized: '4111111111111111',
          currency: { code: 'UAH' },
          group: { isActive: false, archivedAt: null },
        }),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
    } as unknown as PrismaService;

    await expect(svc(prisma).activate(requisiteId)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.requisite.update).not.toHaveBeenCalled();
  });

  it('rejects when payment group is archived', async () => {
    const prisma = {
      requisite: {
        findUnique: jest.fn().mockResolvedValue({
          id: requisiteId,
          traderId: 't',
          type: RequisiteType.CARD,
          numberNormalized: '4111111111111111',
          currency: { code: 'UAH' },
          group: { isActive: false, archivedAt: new Date() },
        }),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
    } as unknown as PrismaService;

    await expect(svc(prisma).activate(requisiteId)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.requisite.update).not.toHaveBeenCalled();
  });

  it('rejects when another active requisite already uses the same normalized identity', async () => {
    const prisma = {
      requisite: {
        findUnique: jest.fn().mockResolvedValue({
          id: requisiteId,
          traderId: 't',
          type: RequisiteType.CARD,
          numberNormalized: '4111111111111111',
          currency: { code: 'UAH' },
          group: { isActive: true, archivedAt: null },
        }),
        findFirst: jest.fn().mockResolvedValue({ id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' }),
        update: jest.fn(),
      },
    } as unknown as PrismaService;

    await expect(svc(prisma).activate(requisiteId)).rejects.toMatchObject({
      response: expect.objectContaining({
        message: expect.stringContaining('REQUISITE_ALREADY_EXISTS'),
      }),
    });
    expect(prisma.requisite.update).not.toHaveBeenCalled();
  });
});

describe('RequisitesService.incrementUsageInTransaction', () => {
  const requisiteId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

  function svc(prisma: PrismaService) {
    return new RequisitesService(
      prisma,
      {} as CascadeService,
      {} as ExchangeRateService,
      { invalidateCurrency: jest.fn() } as unknown as CascadeRedisStateService,
      auditStub,
    );
  }

  it('throws BadRequest when the atomic update caps (no row updated)', async () => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      requisite: {
        findUnique: jest.fn().mockResolvedValue({
          id: requisiteId,
          usedAmount: new Prisma.Decimal(7000),
          limitTotalAmount: new Prisma.Decimal(7000),
          usedOps: 10,
          limitTotalOps: 100,
        }),
      },
    } as unknown as Prisma.TransactionClient;

    await expect(
      svc({} as PrismaService).incrementUsageInTransaction(tx, requisiteId, 500),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        message: expect.stringContaining('REQUISITE_LIMIT_EXCEEDED'),
      }),
    });
    expect(tx.requisite.findUnique).toHaveBeenCalled();
  });

  it('applies increment and auto-disables when amount limit is reached', async () => {
    const updateMock = jest.fn().mockResolvedValue({});
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([
        {
          id: requisiteId,
          used_amount: new Prisma.Decimal(7000),
          limit_total_amount: new Prisma.Decimal(7000),
          used_ops: 5,
          limit_total_ops: 100,
          currency_id: '33333333-3333-3333-3333-333333333333',
        },
      ]),
      requisite: { findUnique: jest.fn(), update: updateMock },
      currency: {
        findUnique: jest.fn().mockResolvedValue({ code: 'UAH' }),
      },
    } as unknown as Prisma.TransactionClient;

    await svc({} as PrismaService).incrementUsageInTransaction(tx, requisiteId, 100);

    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: requisiteId },
        data: expect.objectContaining({
          isActive: false,
        }),
      }),
    );
  });
});

describe('RequisitesService.releaseUsageInTransaction', () => {
  const requisiteId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

  function svc(prisma: PrismaService) {
    return new RequisitesService(
      prisma,
      {} as CascadeService,
      {} as ExchangeRateService,
      { invalidateCurrency: jest.fn() } as unknown as CascadeRedisStateService,
      auditStub,
    );
  }

  it('auto-reenables when limit-driven inactive requisite has headroom again', async () => {
    const updates: unknown[] = [];
    const tx = {
      requisite: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({
            id: requisiteId,
            usedAmount: new Prisma.Decimal(1000),
            usedOps: 10,
            currency: { code: 'UAH' },
          })
          .mockResolvedValueOnce({
            id: requisiteId,
            usedAmount: new Prisma.Decimal(800),
            usedOps: 9,
            limitTotalAmount: new Prisma.Decimal(10000),
            limitTotalOps: 10,
            isActive: false,
            disabledReason: RequisiteDisabledReason.LIMIT_TX,
            type: 'CARD' as const,
            numberNormalized: '4111111111111111',
            group: { isActive: true, archivedAt: null },
          }),
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockImplementation((args: { data: unknown }) => {
          updates.push(args.data);
          return Promise.resolve({});
        }),
      },
    } as unknown as Prisma.TransactionClient;

    await svc({} as PrismaService).releaseUsageInTransaction(tx, requisiteId, 200);

    expect(tx.requisite.update).toHaveBeenCalledTimes(2);
    expect(updates[0]).toMatchObject({ usedOps: 9, usedAmount: 800 });
    expect(updates[1]).toMatchObject({ isActive: true, disabledReason: null });
  });

  it('does not auto-reenable when disabled manually', async () => {
    const tx = {
      requisite: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({
            id: requisiteId,
            usedAmount: new Prisma.Decimal(1000),
            usedOps: 10,
            currency: { code: 'UAH' },
          })
          .mockResolvedValueOnce({
            id: requisiteId,
            usedAmount: new Prisma.Decimal(800),
            usedOps: 9,
            limitTotalAmount: new Prisma.Decimal(10000),
            limitTotalOps: 10,
            isActive: false,
            disabledReason: RequisiteDisabledReason.MANUAL,
            type: 'CARD' as const,
            numberNormalized: '4111111111111111',
            group: { isActive: true, archivedAt: null },
          }),
        findFirst: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
    } as unknown as Prisma.TransactionClient;

    await svc({} as PrismaService).releaseUsageInTransaction(tx, requisiteId, 200);

    expect(tx.requisite.update).toHaveBeenCalledTimes(1);
    expect(tx.requisite.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ usedOps: 9, usedAmount: 800 }),
      }),
    );
  });

  it('does not auto-reenable when payment group is inactive', async () => {
    const tx = {
      requisite: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({
            id: requisiteId,
            usedAmount: new Prisma.Decimal(1000),
            usedOps: 10,
            currency: { code: 'UAH' },
          })
          .mockResolvedValueOnce({
            id: requisiteId,
            usedAmount: new Prisma.Decimal(800),
            usedOps: 9,
            limitTotalAmount: new Prisma.Decimal(10000),
            limitTotalOps: 10,
            isActive: false,
            disabledReason: RequisiteDisabledReason.LIMIT_TX,
            type: 'CARD' as const,
            numberNormalized: '4111111111111111',
            group: { isActive: false, archivedAt: null },
          }),
        findFirst: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
    } as unknown as Prisma.TransactionClient;

    await svc({} as PrismaService).releaseUsageInTransaction(tx, requisiteId, 200);

    expect(tx.requisite.update).toHaveBeenCalledTimes(1);
  });
});

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
      auditStub,
    );
  }

  const baseDto: CreateRequisiteDto = {
    groupId,
    type: RequisiteType.CARD,
    number: '4111111111111111',
    owner: 'Jane Doe',
    cardHolderName: 'Doe Jane Ivanovna',
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
          isActive: true,
        }),
      },
      bank: { findFirst: jest.fn().mockResolvedValue(null) },
      requisite: { findFirst: jest.fn(), create: jest.fn() },
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
          isActive: true,
        }),
      },
      bank: {
        findFirst: jest.fn().mockResolvedValue({ id: 1, name: 'TestBank', isActive: true }),
      },
      requisite: {
        findFirst: jest.fn().mockResolvedValue(null),
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
          numberNormalized: '4111111111111111',
          isActive: true,
        }),
      }),
    );
  });

  it('creates inactive requisite when group is inactive', async () => {
    const prisma = {
      requisiteGroup: {
        findFirst: jest.fn().mockResolvedValue({
          id: groupId,
          traderId,
          archivedAt: null,
          currencyId,
          isActive: false,
        }),
      },
      bank: {
        findFirst: jest.fn().mockResolvedValue({ id: 1, name: 'TestBank', isActive: true }),
      },
      requisite: {
        findFirst: jest.fn().mockResolvedValue(null),
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
          isActive: false,
        }),
      }),
    );
  });

  it('rejects when an active requisite with the same normalized number already exists', async () => {
    const prisma = {
      requisiteGroup: {
        findFirst: jest.fn().mockResolvedValue({
          id: groupId,
          traderId,
          archivedAt: null,
          currencyId,
          isActive: true,
        }),
      },
      bank: {
        findFirst: jest.fn().mockResolvedValue({ id: 1, name: 'TestBank', isActive: true }),
      },
      requisite: {
        findFirst: jest.fn().mockResolvedValue({ id: 'existing-active' }),
        create: jest.fn(),
      },
    } as unknown as PrismaService;

    await expect(svc(prisma).create(traderId, baseDto)).rejects.toMatchObject({
      response: expect.objectContaining({
        message: expect.stringContaining('REQUISITE_ALREADY_EXISTS'),
      }),
    });
    expect(prisma.requisite.create).not.toHaveBeenCalled();
  });

  it('maps unique violations on create to duplicate requisite error', async () => {
    const prisma = {
      requisiteGroup: {
        findFirst: jest.fn().mockResolvedValue({
          id: groupId,
          traderId,
          archivedAt: null,
          currencyId,
          isActive: true,
        }),
      },
      bank: {
        findFirst: jest.fn().mockResolvedValue({ id: 1, name: 'TestBank', isActive: true }),
      },
      requisite: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(() => {
          throw new Prisma.PrismaClientKnownRequestError('unique', {
            code: 'P2002',
            clientVersion: 'test',
          });
        }),
      },
    } as unknown as PrismaService;

    await expect(svc(prisma).create(traderId, baseDto)).rejects.toMatchObject({
      response: expect.objectContaining({
        message: expect.stringContaining('REQUISITE_ALREADY_EXISTS'),
      }),
    });
  });

  it('rejects empty normalized card number', async () => {
    const prisma = {
      requisiteGroup: {
        findFirst: jest.fn().mockResolvedValue({
          id: groupId,
          traderId,
          archivedAt: null,
          currencyId,
          isActive: true,
        }),
      },
      bank: {
        findFirst: jest.fn().mockResolvedValue({ id: 1, name: 'TestBank', isActive: true }),
      },
      requisite: { findFirst: jest.fn(), create: jest.fn() },
    } as unknown as PrismaService;

    await expect(
      svc(prisma).create(traderId, { ...baseDto, number: '----' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.requisite.create).not.toHaveBeenCalled();
  });
});
