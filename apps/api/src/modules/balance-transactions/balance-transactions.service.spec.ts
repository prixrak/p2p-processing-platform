import { BalanceTransactionType } from '@prisma/client';
import { BalanceTransactionsService } from './balance-transactions.service';

describe('BalanceTransactionsService', () => {
  const currencies = {
    requireActiveCurrencyIdByCode: jest.fn().mockResolvedValue('00000000-0000-0000-0000-000000000001'),
    normalizeCode: (c: string) => c.trim().toUpperCase(),
    findCurrencyIdByCode: jest.fn(),
  };

  it('schedules settlement handbook Telegram alerts after USDT ledger rows', async () => {
    const prisma = {
      balanceTransaction: {
        create: jest.fn().mockResolvedValue({ id: 'tx-1' }),
      },
    };
    const telegram = {
      scheduleTraderSettlementHandbookAlerts: jest.fn(),
    };
    const service = new BalanceTransactionsService(
      prisma as never,
      telegram as never,
      currencies as never,
    );

    await service.record({
      traderId: '00000000-0000-0000-0000-000000000001',
      type: BalanceTransactionType.PAYIN_DEBIT,
      amount: 1,
      currency: 'USDT',
    });

    expect(telegram.scheduleTraderSettlementHandbookAlerts).toHaveBeenCalledWith({
      traderId: '00000000-0000-0000-0000-000000000001',
      balanceTxType: BalanceTransactionType.PAYIN_DEBIT,
      topUpAmountUsdt: undefined,
    });
  });

  it('passes top-up amount for TOP_UP', async () => {
    const prisma = {
      balanceTransaction: {
        create: jest.fn().mockResolvedValue({ id: 'tx-2' }),
      },
    };
    const telegram = {
      scheduleTraderSettlementHandbookAlerts: jest.fn(),
    };
    const service = new BalanceTransactionsService(
      prisma as never,
      telegram as never,
      currencies as never,
    );

    await service.record({
      traderId: '00000000-0000-0000-0000-000000000002',
      type: BalanceTransactionType.TOP_UP,
      amount: 99.5,
      currency: 'USDT',
    });

    expect(telegram.scheduleTraderSettlementHandbookAlerts).toHaveBeenCalledWith({
      traderId: '00000000-0000-0000-0000-000000000002',
      balanceTxType: BalanceTransactionType.TOP_UP,
      topUpAmountUsdt: 99.5,
    });
  });

  it('does not schedule for non-USDT currencies', async () => {
    const prisma = {
      balanceTransaction: {
        create: jest.fn().mockResolvedValue({ id: 'tx-3' }),
      },
    };
    const telegram = {
      scheduleTraderSettlementHandbookAlerts: jest.fn(),
    };
    const service = new BalanceTransactionsService(
      prisma as never,
      telegram as never,
      currencies as never,
    );

    await service.record({
      traderId: '00000000-0000-0000-0000-000000000003',
      type: BalanceTransactionType.PAYIN_DEBIT,
      amount: 100,
      currency: 'UAH',
    });

    expect(telegram.scheduleTraderSettlementHandbookAlerts).not.toHaveBeenCalled();
  });
});
