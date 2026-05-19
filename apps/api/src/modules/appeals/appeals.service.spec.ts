import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { AppealStatus, UserRole } from '@p2p/shared';
import { AppealsService } from './appeals.service';

function mockResolvedAppeal(overrides: Record<string, unknown>) {
  return {
    id: 'a2',
    status: AppealStatus.OPEN,
    payinOrderId: 'oid',
    paidAmount: 100,
    createdAt: new Date('2020-01-01T00:00:00.000Z'),
    proofs: [] as { fileId: string }[],
    payinOrder: {
      traderId: 'tp-self',
      amount: 200,
      currency: { code: 'USD' },
      requisite: { number: '4111', owner: 'ACME', cardHolderName: 'Smith John', bank: { name: 'Test Bank' } },
    },
    ...overrides,
  };
}

function mockPayinService() {
  return {
    settlePayInOrderWhenAppealCloses: jest.fn().mockResolvedValue({ id: 'order-x' }),
  };
}

describe('AppealsService.resolve authorization', () => {
  it('rejects trader resolve when order belongs to another trader', async () => {
    const payin = mockPayinService();
    const prisma = {
      appeal: {
        findUnique: jest.fn().mockResolvedValue(
          mockResolvedAppeal({
            payinOrder: {
              traderId: 'tp-other',
              amount: 200,
              currency: { code: 'USD' },
              requisite: { number: 'x', owner: 'y', cardHolderName: '', bank: { name: 'B' } },
            },
          }),
        ),
      },
    };

    const service = new AppealsService(prisma as never, payin as never);

    await expect(
      service.resolve('a2', AppealStatus.RESOLVED, {
        role: UserRole.TRADER,
        traderId: 'tp-self',
      }),
    ).rejects.toThrow(ForbiddenException);

    expect(payin.settlePayInOrderWhenAppealCloses).not.toHaveBeenCalled();
  });

  it('allows trader resolve when trader matches pay-in assignee', async () => {
    const payin = mockPayinService();
    const afterSettle = mockResolvedAppeal({ status: AppealStatus.RESOLVED });
    const prisma = {
      appeal: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(mockResolvedAppeal({}))
          .mockResolvedValueOnce(afterSettle),
      },
    };

    const service = new AppealsService(prisma as never, payin as never);

    const out = await service.resolve('a2', AppealStatus.RESOLVED, {
      role: UserRole.TRADER,
      traderId: 'tp-self',
    });

    expect(out.status).toBe(AppealStatus.RESOLVED);
    expect(payin.settlePayInOrderWhenAppealCloses).toHaveBeenCalledWith(
      'a2',
      AppealStatus.RESOLVED,
      undefined,
    );
  });

  it('returns 404 when appeal missing', async () => {
    const payin = mockPayinService();
    const prisma = {
      appeal: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };

    const service = new AppealsService(prisma as never, payin as never);

    await expect(
      service.resolve('missing', AppealStatus.RESOLVED, {
        role: UserRole.SUPPORT,
        traderId: null,
      }),
    ).rejects.toThrow(NotFoundException);

    expect(payin.settlePayInOrderWhenAppealCloses).not.toHaveBeenCalled();
  });
});

describe('AppealsService.findAll', () => {
  it('scopes listBucket current to OPEN', async () => {
    const prisma = {
      appeal: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };

    const service = new AppealsService(prisma as never, mockPayinService() as never);
    await service.findAll({ listBucket: 'current', page: 1, limit: 10 }, undefined);

    expect(prisma.appeal.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: AppealStatus.OPEN }),
      }),
    );
  });

  it('applies search OR when search filter is set', async () => {
    const prisma = {
      appeal: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };

    const service = new AppealsService(prisma as never, mockPayinService() as never);
    await service.findAll(
      { listBucket: 'current', page: 1, limit: 10, search: '4111' },
      'tp-1',
    );

    expect(prisma.appeal.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            expect.objectContaining({
              OR: expect.any(Array),
            }),
          ]),
        }),
      }),
    );
  });

  it('scopes listBucket history to RESOLVED and REJECTED', async () => {
    const prisma = {
      appeal: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };

    const service = new AppealsService(prisma as never, mockPayinService() as never);
    await service.findAll({ listBucket: 'history', page: 1, limit: 10 }, undefined);

    expect(prisma.appeal.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { in: [AppealStatus.RESOLVED, AppealStatus.REJECTED] },
        }),
      }),
    );
  });
});
