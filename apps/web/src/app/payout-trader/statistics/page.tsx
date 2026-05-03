'use client';

import { useQuery } from '@tanstack/react-query';
import { BarChart3 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { StatCard } from '@/components/ui/stat-card';
import { api } from '@/lib/api';
import { internalPaths } from '@/lib/internal-api';
import { specialistCabinetKeys } from '@/lib/query-keys';

interface SpecialistStats {
  payout_trader_id: string;
  currency: string;
  total_volume: number;
  total_orders: number;
  successful_orders: number;
  canceled_orders: number;
  conversion_rate: number;
  period: string | null;
}

export default function PayoutTraderStatisticsPage() {
  const { data, isLoading } = useQuery({
    queryKey: specialistCabinetKeys.statistics({ period: '30d' }),
    queryFn: () =>
      api.get<SpecialistStats>(internalPaths.payoutSpecialistStatistics, { period: '30d' }),
  });

  const loading = isLoading || !data;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-3">
        <BarChart3 className="h-7 w-7 text-accent-blue" />
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Statistics</h1>
          <p className="text-sm text-text-muted">Last 30 days · {data?.currency ?? '…'}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Completed volume"
          value={loading ? '…' : `${data.total_volume.toLocaleString()} ${data.currency}`}
          icon={BarChart3}
        />
        <StatCard
          label="Total orders"
          value={loading ? '…' : String(data.total_orders)}
          icon={BarChart3}
        />
        <StatCard
          label="Successful"
          value={loading ? '…' : String(data.successful_orders)}
          icon={BarChart3}
        />
        <StatCard
          label="Conversion"
          value={loading ? '…' : `${data.conversion_rate.toFixed(1)}%`}
          icon={BarChart3}
        />
      </div>

      <Card className="p-6">
        <h2 className="text-sm font-medium text-text-secondary mb-2">Failed / closed</h2>
        <p className="text-2xl font-semibold text-text-primary">
          {loading ? '…' : data.canceled_orders}
        </p>
      </Card>
    </div>
  );
}
