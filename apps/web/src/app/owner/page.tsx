'use client';

import { useQuery } from '@tanstack/react-query';
import {
  Users,
  Store,
  FileText,
  Wallet,
  TrendingUp,
  ArrowDownLeft,
  ArrowUpRight,
  AlertTriangle,
} from 'lucide-react';
import { api } from '@/lib/api';
import { internalPaths } from '@/lib/internal-api';
import { ownerKeys } from '@/lib/query-keys';
import { StatCard } from '@/components/ui/card';
import { statCardToneAt } from '@/lib/surface-ring';

interface PlatformStats {
  totalUsers: number;
  totalMerchants: number;
  totalOrders: number;
  totalVolume: number;
  activePayins: number;
  activePayouts: number;
  pendingSettlements: number;
  disputesCount: number;
}

export default function OwnerDashboard() {
  const { data: stats } = useQuery({
    queryKey: ownerKeys.stats(),
    queryFn: () => api.get<PlatformStats>(internalPaths.adminStats),
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Owner Dashboard</h1>
        <p className="mt-1 text-sm text-text-muted">Full platform overview and management</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Users"
          value={stats?.totalUsers ?? '—'}
          icon={Users}
          href="/owner/users"
          tone={statCardToneAt(0)}
        />
        <StatCard
          title="Merchants"
          value={stats?.totalMerchants ?? '—'}
          icon={Store}
          href="/owner/users"
          tone={statCardToneAt(1)}
        />
        <StatCard
          title="Total Orders"
          value={stats?.totalOrders?.toLocaleString() ?? '—'}
          icon={FileText}
          href="/owner/orders"
          tone={statCardToneAt(2)}
        />
        <StatCard
          title="Total Volume"
          value={stats?.totalVolume ? `$${stats.totalVolume.toLocaleString()}` : '—'}
          icon={TrendingUp}
          href="/owner/statistics"
          tone={statCardToneAt(3)}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Active Pay-Ins"
          value={stats?.activePayins ?? '—'}
          icon={ArrowDownLeft}
          href="/owner/orders"
          tone={statCardToneAt(4)}
        />
        <StatCard
          title="Active Pay-Outs"
          value={stats?.activePayouts ?? '—'}
          icon={ArrowUpRight}
          href="/owner/orders"
          tone={statCardToneAt(5)}
        />
        <StatCard
          title="Pending Settlements"
          value={stats?.pendingSettlements ?? '—'}
          icon={Wallet}
          href="/owner/settlements"
          tone={statCardToneAt(6)}
        />
        <StatCard
          title="Open Disputes"
          value={stats?.disputesCount ?? '—'}
          icon={AlertTriangle}
          href="/owner/orders"
          tone={stats?.disputesCount ? 'rose' : statCardToneAt(7)}
        />
      </div>
    </div>
  );
}
