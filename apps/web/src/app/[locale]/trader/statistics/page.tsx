'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import {
  BarChart3,
  TrendingUp,
  ShoppingCart,
  CheckCircle2,
  XCircle,
  Percent,
  LineChart,
} from 'lucide-react';
import { StatCard, Card } from '@/components/ui/card';
import { Select } from '@/components/ui/select';
import { api } from '@/lib/api';
import { internalPaths } from '@/lib/internal-api';
import { traderKeys } from '@/lib/query-keys';
import { formatCurrency } from '@/lib/utils';
import {
  TraderVolumeChart,
  TraderPayinStatusChart,
  TraderPayoutStatusChart,
} from '@/components/charts/trader-statistics-charts';

interface TraderStatistics {
  traderId: string;
  currency: string;
  period: '24h' | '7d' | '30d' | '90d' | null;
  dateFrom: string | null;
  dateTo: string | null;
  totalVolume: number;
  totalOrders: number;
  successfulOrders: number;
  canceledOrders: number;
  conversionRate: number;
  volumeByDay: Array<{
    date: string;
    payinVolume: number;
    payoutVolume: number;
    totalVolume: number;
  }>;
  ordersByStatus: {
    payIn: Record<string, number>;
    payout: Record<string, number>;
  };
}

export default function StatisticsPage() {
  const t = useTranslations('Trader.Statistics');
  const tPayin = useTranslations('Trader.Payin');
  const tPayout = useTranslations('Trader.Payout');
  const [period, setPeriod] = useState('7d');

  const periodOptions = useMemo(
    () => [
      { value: '24h', label: t('period24h') },
      { value: '7d', label: t('period7d') },
      { value: '30d', label: t('period30d') },
      { value: '90d', label: t('period90d') },
    ],
    [t],
  );

  const { data: stats, isLoading } = useQuery({
    queryKey: traderKeys.statistics(period),
    queryFn: () => api.get<TraderStatistics>(internalPaths.traderMeStatistics, { period }),
  });

  const loading = isLoading || !stats;

  const hasVolume = stats?.volumeByDay?.some((d) => d.totalVolume > 0) ?? false;

  const payinStatus = (s: string) =>
    tPayin(`statuses.${s as 'NEW'}` as Parameters<typeof tPayin>[0]);
  const payoutStatus = (s: string) =>
    tPayout(`statuses.${s as 'NEW'}` as Parameters<typeof tPayout>[0]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <BarChart3 className="h-6 w-6 text-accent-blue" />
          <div>
            <h1 className="text-2xl font-bold text-text-primary">{t('title')}</h1>
            <p className="text-sm text-text-muted">{t('subtitle')}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Select
            options={periodOptions}
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="w-44"
            rootClassName="gap-1"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          title={t('statTotalVolume')}
          value={loading ? t('loading') : formatCurrency(stats?.totalVolume ?? 0, stats?.currency ?? 'UAH')}
          icon={TrendingUp}
        />
        <StatCard
          title={t('statTotalOrders')}
          value={loading ? t('loading') : (stats?.totalOrders ?? 0)}
          icon={ShoppingCart}
        />
        <StatCard
          title={t('statSuccessful')}
          value={loading ? t('loading') : (stats?.successfulOrders ?? 0)}
          icon={CheckCircle2}
        />
        <StatCard
          title={t('statCanceled')}
          value={loading ? t('loading') : (stats?.canceledOrders ?? 0)}
          icon={XCircle}
        />
        <StatCard
          title={t('statConversion')}
          value={loading ? t('loading') : `${(stats?.conversionRate ?? 0).toFixed(1)}%`}
          icon={Percent}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <LineChart className="h-5 w-5 text-text-muted" />
            <h2 className="text-lg font-semibold text-text-primary">{t('volumeOverTimeTitle')}</h2>
          </div>
          <p className="text-xs text-text-muted mb-4">
            {t('volumeOverTimeHelp', { currency: stats?.currency ?? 'UAH' })}
          </p>
          {loading ? (
            <div className="h-72 rounded-lg bg-bg-tertiary animate-pulse" />
          ) : (
            <TraderVolumeChart
              data={stats?.volumeByDay ?? []}
              currency={stats?.currency ?? 'UAH'}
              empty={!hasVolume}
              payInName={t('chartLegendPayIn')}
              payOutName={t('chartLegendPayOut')}
              emptyMessage={t('chartVolumeEmpty')}
            />
          )}
        </Card>

        <Card>
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="h-5 w-5 text-text-muted" />
            <h2 className="text-lg font-semibold text-text-primary">{t('ordersByStatusTitle')}</h2>
          </div>
          <p className="text-xs text-text-muted mb-4">{t('ordersByStatusHelp')}</p>
          <div className="space-y-8">
            <div>
              <h3 className="text-sm font-medium text-text-secondary mb-2">{t('payInSection')}</h3>
              {loading ? (
                <div className="h-64 rounded-lg bg-bg-tertiary animate-pulse" />
              ) : (
                <TraderPayinStatusChart
                  counts={stats?.ordersByStatus.payIn ?? {}}
                  statusLabel={payinStatus}
                  emptyMessage={t('chartPayInEmpty')}
                  ordersAxisLabel={t('chartBarOrders')}
                />
              )}
            </div>
            <div>
              <h3 className="text-sm font-medium text-text-secondary mb-2">{t('payOutSection')}</h3>
              {loading ? (
                <div className="h-64 rounded-lg bg-bg-tertiary animate-pulse" />
              ) : (
                <TraderPayoutStatusChart
                  counts={stats?.ordersByStatus.payout ?? {}}
                  statusLabel={payoutStatus}
                  emptyMessage={t('chartPayOutEmpty')}
                  ordersAxisLabel={t('chartBarOrders')}
                />
              )}
            </div>
          </div>
        </Card>
      </div>

      {!loading && stats && stats.totalOrders === 0 && (
        <Card>
          <p className="text-sm text-text-muted text-center py-6">{t('emptyPeriod')}</p>
        </Card>
      )}
    </div>
  );
}
