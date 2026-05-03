'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
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

const PERIOD_OPTIONS = [
  { value: '24h', label: 'Last 24 hours' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
];

export default function StatisticsPage() {
  const [period, setPeriod] = useState('7d');

  const { data: stats, isLoading } = useQuery({
    queryKey: traderKeys.statistics(period),
    queryFn: () =>
      api.get<TraderStatistics>(internalPaths.traderMeStatistics, { period }),
  });

  const loading = isLoading || !stats;

  const hasVolume =
    stats?.volumeByDay?.some((d) => d.totalVolume > 0) ?? false;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <BarChart3 className="h-6 w-6 text-accent-blue" />
          <div>
            <h1 className="text-2xl font-bold text-text-primary">Statistics</h1>
            <p className="text-sm text-text-muted">Your personal trading analytics</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Select
            options={PERIOD_OPTIONS}
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="w-44"
            rootClassName="gap-1"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          title="Total Volume"
          value={loading ? '…' : formatCurrency(stats?.totalVolume ?? 0, stats?.currency ?? 'UAH')}
          icon={TrendingUp}
        />
        <StatCard
          title="Total Orders"
          value={loading ? '…' : (stats?.totalOrders ?? 0)}
          icon={ShoppingCart}
        />
        <StatCard
          title="Successful"
          value={loading ? '…' : (stats?.successfulOrders ?? 0)}
          icon={CheckCircle2}
        />
        <StatCard
          title="Canceled / failed"
          value={loading ? '…' : (stats?.canceledOrders ?? 0)}
          icon={XCircle}
        />
        <StatCard
          title="Conversion Rate"
          value={loading ? '…' : `${(stats?.conversionRate ?? 0).toFixed(1)}%`}
          icon={Percent}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <LineChart className="h-5 w-5 text-text-muted" />
            <h2 className="text-lg font-semibold text-text-primary">Volume over time</h2>
          </div>
          <p className="text-xs text-text-muted mb-4">
            Successful pay-in (paid) and pay-out (completed) volume, {stats?.currency ?? 'UAH'} only
          </p>
          {loading ? (
            <div className="h-72 rounded-lg bg-bg-tertiary animate-pulse" />
          ) : (
            <TraderVolumeChart
              data={stats?.volumeByDay ?? []}
              currency={stats?.currency ?? 'UAH'}
              empty={!hasVolume}
            />
          )}
        </Card>

        <Card>
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="h-5 w-5 text-text-muted" />
            <h2 className="text-lg font-semibold text-text-primary">Orders by status</h2>
          </div>
          <p className="text-xs text-text-muted mb-4">Pay-In and Pay-Out counts in the selected window</p>
          <div className="space-y-8">
            <div>
              <h3 className="text-sm font-medium text-text-secondary mb-2">Pay-In</h3>
              {loading ? (
                <div className="h-64 rounded-lg bg-bg-tertiary animate-pulse" />
              ) : (
                <TraderPayinStatusChart counts={stats?.ordersByStatus.payIn ?? {}} />
              )}
            </div>
            <div>
              <h3 className="text-sm font-medium text-text-secondary mb-2">Pay-Out</h3>
              {loading ? (
                <div className="h-64 rounded-lg bg-bg-tertiary animate-pulse" />
              ) : (
                <TraderPayoutStatusChart counts={stats?.ordersByStatus.payout ?? {}} />
              )}
            </div>
          </div>
        </Card>
      </div>

      {!loading && stats && stats.totalOrders === 0 && (
        <Card>
          <p className="text-sm text-text-muted text-center py-6">
            No orders in this period. Try a longer range or wait for new activity.
          </p>
        </Card>
      )}
    </div>
  );
}
