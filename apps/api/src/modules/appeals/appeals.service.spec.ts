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
      currency: 'USD',
      requisite: { number: '4111', owner: 'ACME', bank: { name: 'Test Bank' } },
    },
    ...overrides,
  };
}

describe('AppealsService.resolve authorization', () => {
  it('rejects trader resolve when order belongs to another trader', async () => {
    const prisma = {
      appeal: {
        findUnique: jest.fn().mockResolvedValue(
          mockResolvedAppeal({
            payinOrder: {
              traderId: 'tp-other',
              amount: 200,
              currency: 'USD',
              requisite: { number: 'x', owner: 'y', bank: { name: 'B' } },
            },
          }),
        ),
        update: jest.fn(),
      },
    };

    const service = new AppealsService(prisma as never);

    await expect(
      service.resolve('a2', AppealStatus.RESOLVED, {
        role: UserRole.TRADER,
        traderId: 'tp-self',
      }),
    ).rejects.toThrow(ForbiddenException);

    expect(prisma.appeal.update).not.toHaveBeenCalled();
  });

  it('allows trader resolve when trader matches pay-in assignee', async () => {
    const updatedRow = mockResolvedAppeal({ status: AppealStatus.RESOLVED });
    const prisma = {
      appeal: {
        findUnique: jest.fn().mockResolvedValue(mockResolvedAppeal({})),
        update: jest.fn().mockResolvedValue(updatedRow),
      },
    };

    const service = new AppealsService(prisma as never);

    const out = await service.resolve('a2', AppealStatus.RESOLVED, {
      role: UserRole.TRADER,
      traderId: 'tp-self',
    });

    expect(out.status).toBe(AppealStatus.RESOLVED);
    expect(prisma.appeal.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'a2' },
        data: { status: AppealStatus.RESOLVED },
      }),
    );
  });

  it('returns 404 when appeal missing', async () => {
    const prisma = {
      appeal: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };

    const service = new AppealsService(prisma as never);

    await expect(
      service.resolve('missing', AppealStatus.RESOLVED, {
        role: UserRole.SUPPORT,
        traderId: null,
      }),
    ).rejects.toThrow(NotFoundException);
  });
});
