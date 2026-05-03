'use client';

import { useQuery } from '@tanstack/react-query';
import {
  BarChart3,
  TrendingUp,
  ArrowLeftRight,
  Percent,
  DollarSign,
  Clock,
} from 'lucide-react';
import { PayInOrderStatus } from '@p2p/shared';
import { api } from '@/lib/api';
import { internalPaths } from '@/lib/internal-api';
import { adminKeys } from '@/lib/query-keys';
import { StatCard } from '@/components/ui/stat-card';
import { payinStatusLabel } from '@/lib/order-status-ui';

interface PlatformStats {
  totalTraffic: number;
  /** Lowercase Pay-In status keys from API (`groupBy` payin orders). */
  ordersByStatus: Record<string, number>;
  conversionRate: number;
  totalCommissions: number;
  totalOrders: number;
}

export default function StatisticsPage() {
  const { data: stats, isLoading } = useQuery<PlatformStats>({
    queryKey: adminKeys.statistics(),
    queryFn: () =>
      api.get(internalPaths.adminStatistics),
  });

  const loading = isLoading || !stats;

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
          <BarChart3 size={24} />
          Platform Statistics
        </h1>
        <p className="text-sm text-text-muted mt-1">
          Comprehensive platform performance metrics
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Traffic"
          value={loading ? '...' : `$${stats.totalTraffic.toLocaleString()}`}
          icon={TrendingUp}
        />
        <StatCard
          label="Total Orders"
          value={loading ? '...' : stats.totalOrders.toLocaleString()}
          icon={ArrowLeftRight}
        />
        <StatCard
          label="Conversion Rate"
          value={loading ? '...' : `${stats.conversionRate.toFixed(1)}%`}
          icon={Percent}
        />
        <StatCard
          label="Total Commissions"
          value={loading ? '...' : `$${stats.totalCommissions.toLocaleString()}`}
          icon={DollarSign}
        />
      </div>

      <div>
        <h2 className="text-lg font-semibold text-text-primary mb-1">
          Orders by Status
        </h2>
        <p className="text-xs text-text-muted mb-4">
          Pay-In order counts in the selected period (same window as other metrics)
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {(Object.values(PayInOrderStatus) as PayInOrderStatus[]).map((status) => {
            const key = status.toLowerCase();
            const value = loading ? 0 : (stats.ordersByStatus[key] ?? 0);
            return (
              <StatusStatCard
                key={status}
                label={payinStatusLabel(status)}
                value={value}
                icon={<Clock size={16} />}
                color="text-accent-blue"
                bgColor="bg-accent-blue/10"
              />
            );
          })}
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold text-text-primary mb-4">Charts</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-bg-card border border-border-primary rounded-xl p-8 flex items-center justify-center min-h-[300px]">
            <div className="text-center text-text-muted">
              <BarChart3 size={48} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">Orders volume chart</p>
              <p className="text-xs mt-1">Coming soon</p>
            </div>
          </div>
          <div className="bg-bg-card border border-border-primary rounded-xl p-8 flex items-center justify-center min-h-[300px]">
            <div className="text-center text-text-muted">
              <TrendingUp size={48} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">Conversion rate trend</p>
              <p className="text-xs mt-1">Coming soon</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusStatCard({
  label,
  value,
  icon,
  color,
  bgColor,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
}) {
  return (
    <div className="bg-bg-card border border-border-primary rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className={`p-1.5 rounded-md ${bgColor} ${color}`}>{icon}</div>
        <span className="text-xs text-text-muted">{label}</span>
      </div>
      <p className="text-xl font-bold text-text-primary">
        {value.toLocaleString()}
      </p>
    </div>
  );
}
