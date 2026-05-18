'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  TrendingUp,
  ArrowDownLeft,
  ArrowUpRight,
  DollarSign,
  BarChart3,
  Users,
} from 'lucide-react';
import { api } from '@/lib/api';
import { internalPaths } from '@/lib/internal-api';
import { ownerKeys } from '@/lib/query-keys';
import { StatCard, Card } from '@/components/ui/card';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { formatDateTime } from '@/lib/utils';

interface Statistics {
  totalVolume: number;
  payinVolume: number;
  payoutVolume: number;
  totalCommissions: number;
  totalOrders: number;
  completedOrders: number;
  avgOrderAmount: number;
  activeTraders: number;
  topMerchants: { name: string; volume: number; orders: number }[];
  topTraders: { name: string; volume: number; successRate: number }[];
  dailyVolume: { date: string; payin: number; payout: number }[];
}

export default function StatisticsPage() {
  const [period, setPeriod] = useState('7d');

  const { data: stats } = useQuery({
    queryKey: ownerKeys.statistics(period),
    queryFn: () =>
      api.get<Statistics>(
        `${internalPaths.adminStatistics}?period=${period}`,
      ),
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Statistics</h1>
          <p className="mt-1 text-sm text-text-muted">Platform performance overview</p>
        </div>
        <Select
          options={[
            { value: '24h', label: 'Last 24 hours' },
            { value: '7d', label: 'Last 7 days' },
            { value: '30d', label: 'Last 30 days' },
            { value: '90d', label: 'Last 90 days' },
          ]}
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          className="w-44"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Volume"
          value={stats?.totalVolume ? `$${stats.totalVolume.toLocaleString()}` : '—'}
          icon={TrendingUp}
        />
        <StatCard
          title="Pay-In Volume"
          value={stats?.payinVolume ? `$${stats.payinVolume.toLocaleString()}` : '—'}
          icon={ArrowDownLeft}
        />
        <StatCard
          title="Pay-Out Volume"
          value={stats?.payoutVolume ? `$${stats.payoutVolume.toLocaleString()}` : '—'}
          icon={ArrowUpRight}
        />
        <StatCard
          title="Total Commissions"
          value={stats?.totalCommissions ? `$${stats.totalCommissions.toLocaleString()}` : '—'}
          icon={DollarSign}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          title="Total Orders"
          value={stats?.totalOrders?.toLocaleString() ?? '—'}
          subtitle={`${stats?.completedOrders?.toLocaleString() ?? 0} completed`}
          icon={BarChart3}
        />
        <StatCard
          title="Avg Order Amount"
          value={stats?.avgOrderAmount ? `$${stats.avgOrderAmount.toLocaleString()}` : '—'}
          icon={DollarSign}
        />
        <StatCard
          title="Active Traders"
          value={stats?.activeTraders ?? '—'}
          icon={Users}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Top Merchants by Volume">
          {stats?.topMerchants?.length ? (
            <div className="space-y-3">
              {stats.topMerchants.map((m, i) => (
                <div
                  key={m.name}
                  className="flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent-muted text-xs font-medium text-accent">
                      {i + 1}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-text-primary">{m.name}</p>
                      <p className="text-xs text-text-muted">{m.orders} orders</p>
                    </div>
                  </div>
                  <span className="font-mono text-sm font-medium text-text-primary">
                    ${m.volume.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-4 text-center text-sm text-text-muted">No data for this period</p>
          )}
        </Card>

        <Card title="Top Traders by Volume">
          {stats?.topTraders?.length ? (
            <div className="space-y-3">
              {stats.topTraders.map((t, i) => (
                <div
                  key={t.name}
                  className="flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-success-muted text-xs font-medium text-success">
                      {i + 1}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-text-primary">{t.name}</p>
                      <p className="text-xs text-text-muted">{t.successRate}% success</p>
                    </div>
                  </div>
                  <span className="font-mono text-sm font-medium text-text-primary">
                    ${t.volume.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-4 text-center text-sm text-text-muted">No data for this period</p>
          )}
        </Card>
      </div>

      <Card title="Daily Volume">
        {stats?.dailyVolume?.length ? (
          <div className="overflow-x-auto">
            <div className="flex items-end gap-1" style={{ minHeight: 200 }}>
              {stats.dailyVolume.map((d) => {
                const max = Math.max(...stats.dailyVolume.map((v) => v.payin + v.payout), 1);
                const totalH = ((d.payin + d.payout) / max) * 160;
                const payinH = (d.payin / (d.payin + d.payout || 1)) * totalH;
                return (
                  <div key={d.date} className="flex flex-1 flex-col items-center gap-1">
                    <div className="flex w-full flex-col items-center">
                      <div
                        className="w-full max-w-[32px] rounded-t bg-accent/60"
                        style={{ height: totalH - payinH }}
                      />
                      <div
                        className="w-full max-w-[32px] rounded-b bg-success/60"
                        style={{ height: payinH }}
                      />
                    </div>
                    <span className="text-[10px] text-text-muted">
                      {formatDateTime(new Date(`${d.date}T12:00:00`))}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="mt-3 flex items-center gap-4 text-xs text-text-muted">
              <div className="flex items-center gap-1.5">
                <div className="h-2.5 w-2.5 rounded-sm bg-success/60" /> Pay-In
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-2.5 w-2.5 rounded-sm bg-accent/60" /> Pay-Out
              </div>
            </div>
          </div>
        ) : (
          <p className="py-8 text-center text-sm text-text-muted">No volume data for this period</p>
        )}
      </Card>
    </div>
  );
}
