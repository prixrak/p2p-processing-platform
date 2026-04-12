'use client';

import { useQuery } from '@tanstack/react-query';
import {
  BarChart3,
  TrendingUp,
  ShoppingCart,
  CheckCircle2,
  XCircle,
  Percent,
  RefreshCw,
  LineChart,
} from 'lucide-react';
import { StatCard, Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';

interface TraderStatistics {
  total_volume: number;
  total_orders: number;
  successful_orders: number;
  canceled_orders: number;
  conversion_rate: number;
  currency: string;
  volume_by_day?: { date: string; volume: number }[];
  orders_by_status?: Record<string, number>;
}

export default function StatisticsPage() {
  const { data: stats, isLoading, refetch } = useQuery({
    queryKey: ['trader', 'statistics'],
    queryFn: () => api.get<TraderStatistics>('/api/trader/statistics'),
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BarChart3 className="h-6 w-6 text-accent-blue" />
          <div>
            <h1 className="text-2xl font-bold text-text-primary">Statistics</h1>
            <p className="text-sm text-text-muted">Your personal trading analytics</p>
          </div>
        </div>
        <Button variant="secondary" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          title="Total Volume"
          value={isLoading ? '...' : formatCurrency(stats?.total_volume ?? 0, stats?.currency)}
          icon={TrendingUp}
        />
        <StatCard
          title="Total Orders"
          value={isLoading ? '...' : (stats?.total_orders ?? 0)}
          icon={ShoppingCart}
        />
        <StatCard
          title="Successful"
          value={isLoading ? '...' : (stats?.successful_orders ?? 0)}
          icon={CheckCircle2}
        />
        <StatCard
          title="Canceled"
          value={isLoading ? '...' : (stats?.canceled_orders ?? 0)}
          icon={XCircle}
        />
        <StatCard
          title="Conversion Rate"
          value={isLoading ? '...' : `${(stats?.conversion_rate ?? 0).toFixed(1)}%`}
          icon={Percent}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <LineChart className="h-5 w-5 text-text-muted" />
            <h2 className="text-lg font-semibold text-text-primary">Volume Over Time</h2>
          </div>
          <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-border-secondary">
            <div className="text-center">
              <BarChart3 className="mx-auto h-8 w-8 text-text-muted mb-2" />
              <p className="text-sm text-text-muted">Chart placeholder</p>
              <p className="text-xs text-text-muted mt-1">
                Integrate with a charting library (e.g., recharts)
              </p>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="h-5 w-5 text-text-muted" />
            <h2 className="text-lg font-semibold text-text-primary">Orders by Status</h2>
          </div>
          <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-border-secondary">
            <div className="text-center">
              <BarChart3 className="mx-auto h-8 w-8 text-text-muted mb-2" />
              <p className="text-sm text-text-muted">Chart placeholder</p>
              <p className="text-xs text-text-muted mt-1">
                Integrate with a charting library (e.g., recharts)
              </p>
            </div>
          </div>
        </Card>
      </div>

      {stats?.orders_by_status && (
        <Card>
          <h2 className="text-lg font-semibold text-text-primary mb-4">Status Breakdown</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {Object.entries(stats.orders_by_status).map(([status, count]) => (
              <div
                key={status}
                className="flex items-center justify-between rounded-lg bg-bg-secondary px-4 py-3"
              >
                <span className="text-sm text-text-secondary">{status}</span>
                <span className="text-sm font-semibold text-text-primary">{count}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
