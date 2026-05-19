import { resolveTraderStatisticsCurrency } from './trader-statistics-currency';

describe('resolveTraderStatisticsCurrency', () => {
  const window = {
    from: new Date('2026-05-01T00:00:00.000Z'),
    to: new Date('2026-05-19T23:59:59.999Z'),
  };

  function prismaMock(overrides: {
    payinGroups?: Array<{ currencyId: string; _count: { _all: number } }>;
    payoutGroups?: Array<{ currencyId: string; _count: { _all: number } }>;
    currencies?: Record<string, string>;
    recentPayin?: string | null;
    recentPayout?: string | null;
    balanceCode?: string | null;
  }) {
    const uahId = 'uah-id';
    const usdtId = 'usdt-id';
    const codes: Record<string, string> = {
      [uahId]: 'UAH',
      [usdtId]: 'USDT',
      ...overrides.currencies,
    };

    return {
      payinOrder: {
        groupBy: jest.fn().mockResolvedValue(overrides.payinGroups ?? []),
        findFirst: jest.fn().mockResolvedValue(
          overrides.recentPayin
            ? { currency: { code: overrides.recentPayin } }
            : null,
        ),
      },
      payoutOrder: {
        groupBy: jest.fn().mockResolvedValue(overrides.payoutGroups ?? []),
        findFirst: jest.fn().mockResolvedValue(
          overrides.recentPayout
            ? { currency: { code: overrides.recentPayout } }
            : null,
        ),
      },
      currency: {
        findUnique: jest.fn(({ where: { id } }: { where: { id: string } }) =>
          Promise.resolve(codes[id] ? { code: codes[id] } : null),
        ),
      },
      traderBalance: {
        findFirst: jest.fn().mockResolvedValue(
          overrides.balanceCode
            ? { currency: { code: overrides.balanceCode } }
            : null,
        ),
      },
    } as unknown as Parameters<typeof resolveTraderStatisticsCurrency>[0];
  }

  it('returns explicit preferred currency when provided', async () => {
    const prisma = prismaMock({});
    await expect(
      resolveTraderStatisticsCurrency(prisma, 'trader-1', window, 'uah'),
    ).resolves.toBe('UAH');
    expect(prisma.payinOrder.groupBy).not.toHaveBeenCalled();
  });

  it('prefers currency with most orders in the window over USDT-only balance', async () => {
    const prisma = prismaMock({
      payinGroups: [{ currencyId: 'uah-id', _count: { _all: 4 } }],
      payoutGroups: [],
      balanceCode: 'USDT',
    });
    await expect(resolveTraderStatisticsCurrency(prisma, 'trader-1', window)).resolves.toBe(
      'UAH',
    );
  });

  it('falls back to most recent pay-in currency when window has no orders', async () => {
    const prisma = prismaMock({
      recentPayin: 'UAH',
      balanceCode: 'USDT',
    });
    await expect(resolveTraderStatisticsCurrency(prisma, 'trader-1', window)).resolves.toBe(
      'UAH',
    );
  });

  it('falls back to UAH when no orders and no balances', async () => {
    const prisma = prismaMock({});
    await expect(resolveTraderStatisticsCurrency(prisma, 'trader-1', window)).resolves.toBe(
      'UAH',
    );
  });
});
