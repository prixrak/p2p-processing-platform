import { NotFoundException } from '@nestjs/common';
import { PayoutPoolType, PayoutStatus } from '@prisma/client';
import { PayoutService } from './payout.service';

jest.mock('../../common/order-status-history/order-status-history', () => ({
  fetchOrderStatusHistory: jest.fn().mockResolvedValue([]),
  withOrderStatusHistoryFallback: jest.fn((_history, order) => [
    {
      status: order.status,
      timestamp: order.createdAt,
      actor: 'System',
    },
  ]),
  initialOrderStatusAuditFrom: jest.fn(),
  OrderStatusHistoryEntity: { payout: 'PAYOUT_ORDER' },
  recordOrderStatusChange: jest.fn(),
}));

function createPayoutService(prisma: Record<string, unknown>) {
  return new PayoutService(
    prisma as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
}

describe('PayoutService payout order status history access', () => {
  const traderId = 'trader-1';
  const orderId = '733da3b9-4fcd-4679-a7b8-167b8f9e7754';
  const createdAt = new Date('2026-05-19T10:00:00.000Z');

  const poolOrder = {
    id: orderId,
    status: PayoutStatus.PENDING,
    createdAt,
    traderId: null,
    payoutTraderId: null,
    poolType: PayoutPoolType.STANDARD,
    amount: 100,
  };

  const activeTrader = {
    id: traderId,
    isActive: true,
    acceptingOrders: true,
    payoutMinLimit: 0,
    payoutMaxLimit: 0,
    user: { isActive: true },
  };

  it('returns history for an unassigned standard-pool order within trader limits', async () => {
    const prisma = {
      payoutOrder: {
        findUnique: jest.fn().mockResolvedValue(poolOrder),
      },
      traderProfile: {
        findUnique: jest.fn().mockResolvedValue(activeTrader),
      },
    };
    const service = createPayoutService(prisma);

    const items = await service.getPayoutOrderStatusHistoryForTrader(traderId, orderId);

    expect(items).toHaveLength(1);
    expect(items[0]?.status).toBe(PayoutStatus.PENDING);
    expect(prisma.traderProfile.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: traderId } }),
    );
  });

  it('returns history when the order is assigned to the trader', async () => {
    const prisma = {
      payoutOrder: {
        findUnique: jest.fn().mockResolvedValue({
          ...poolOrder,
          traderId,
          status: PayoutStatus.PROCESSING,
        }),
      },
      traderProfile: { findUnique: jest.fn() },
    };
    const service = createPayoutService(prisma);

    const items = await service.getPayoutOrderStatusHistoryForTrader(traderId, orderId);

    expect(items[0]?.status).toBe(PayoutStatus.PROCESSING);
    expect(prisma.traderProfile.findUnique).not.toHaveBeenCalled();
  });

  it('rejects pool orders outside trader payout limits', async () => {
    const prisma = {
      payoutOrder: {
        findUnique: jest.fn().mockResolvedValue(poolOrder),
      },
      traderProfile: {
        findUnique: jest.fn().mockResolvedValue({
          ...activeTrader,
          payoutMinLimit: 200,
          payoutMaxLimit: 0,
        }),
      },
    };
    const service = createPayoutService(prisma);

    await expect(
      service.getPayoutOrderStatusHistoryForTrader(traderId, orderId),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects pool orders for inactive traders', async () => {
    const prisma = {
      payoutOrder: {
        findUnique: jest.fn().mockResolvedValue(poolOrder),
      },
      traderProfile: {
        findUnique: jest.fn().mockResolvedValue({
          ...activeTrader,
          acceptingOrders: false,
        }),
      },
    };
    const service = createPayoutService(prisma);

    await expect(
      service.getPayoutOrderStatusHistoryForTrader(traderId, orderId),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
