import type { PrismaService } from '../../config/prisma.service';

export type StatisticsTimeWindow = { from: Date; to: Date };

/**
 * Fiat/order currency for trader cabinet statistics.
 * Prefers explicit query, then the currency with the most orders in the window,
 * then the most recent order, then the first balance row (legacy fallback).
 */
export async function resolveTraderStatisticsCurrency(
  prisma: PrismaService,
  traderId: string,
  window: StatisticsTimeWindow,
  preferred?: string,
): Promise<string> {
  const normalized = preferred?.trim().toUpperCase();
  if (normalized && normalized.length >= 3) {
    return normalized;
  }

  const [payinGroups, payoutGroups] = await Promise.all([
    prisma.payinOrder.groupBy({
      by: ['currencyId'],
      where: { traderId, createdAt: { gte: window.from, lte: window.to } },
      _count: { _all: true },
    }),
    prisma.payoutOrder.groupBy({
      by: ['currencyId'],
      where: { traderId, createdAt: { gte: window.from, lte: window.to } },
      _count: { _all: true },
    }),
  ]);

  const countByCurrencyId = new Map<string, number>();
  for (const row of [...payinGroups, ...payoutGroups]) {
    countByCurrencyId.set(
      row.currencyId,
      (countByCurrencyId.get(row.currencyId) ?? 0) + row._count._all,
    );
  }

  if (countByCurrencyId.size > 0) {
    const topCurrencyId = [...countByCurrencyId.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const row = await prisma.currency.findUnique({
      where: { id: topCurrencyId },
      select: { code: true },
    });
    if (row?.code) {
      return row.code;
    }
  }

  const recentPayin = await prisma.payinOrder.findFirst({
    where: { traderId },
    orderBy: { createdAt: 'desc' },
    select: { currency: { select: { code: true } } },
  });
  if (recentPayin?.currency.code) {
    return recentPayin.currency.code;
  }

  const recentPayout = await prisma.payoutOrder.findFirst({
    where: { traderId },
    orderBy: { createdAt: 'desc' },
    select: { currency: { select: { code: true } } },
  });
  if (recentPayout?.currency.code) {
    return recentPayout.currency.code;
  }

  const balance = await prisma.traderBalance.findFirst({
    where: { traderId },
    orderBy: { currency: { code: 'asc' } },
    include: { currency: { select: { code: true } } },
  });
  if (balance?.currency.code) {
    return balance.currency.code;
  }

  return 'UAH';
}
