'use client';

import { useQuery } from '@tanstack/react-query';
import {
  TrendingUp,
  ShoppingCart,
  CheckCircle2,
  CreditCard,
} from 'lucide-react';
import { StatCard } from '@/components/ui/card';
import { api } from '@/lib/api';
import { internalPaths } from '@/lib/internal-api';
import { traderKeys } from '@/lib/query-keys';
import { formatCurrency } from '@/lib/utils';
import { statCardToneAt } from '@/lib/surface-ring';
import { TraderDashboardWalletListSection } from '@/features/trader-dashboard/wallet-list-section';

interface DashboardStats {
  total_volume: number;
  orders_today: number;
  success_rate: number;
  active_requisites: number;
  currency: string;
  accepting_orders?: boolean;
  account_active?: boolean;
}

export default function TraderDashboard() {
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: traderKeys.dashboardStats(),
    queryFn: () => api.get<DashboardStats>(internalPaths.traderDashboardStats),
  });

  const paused =
    stats != null &&
    (stats.account_active === false || stats.accepting_orders === false);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Dashboard</h1>
        <p className="text-sm text-text-muted mt-1">Overview of your trading activity</p>
      </div>

      {paused && (
        <div
          className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-text-primary"
          role="status"
        >
          {stats?.account_active === false
            ? 'Your account is disabled by an administrator.'
            : 'You are paused: new Pay-In and Pay-Out assignments are turned off. Use the toggle in the sidebar to resume.'}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Total Volume"
          value={statsLoading ? '...' : formatCurrency(stats?.total_volume ?? 0, stats?.currency)}
          icon={TrendingUp}
          href="/trader/statistics"
          tone={statCardToneAt(0)}
        />
        <StatCard
          title="Orders Today"
          value={statsLoading ? '...' : (stats?.orders_today ?? 0)}
          icon={ShoppingCart}
          href="/trader/payin"
          tone={statCardToneAt(1)}
        />
        <StatCard
          title="Success Rate"
          value={statsLoading ? '...' : `${(stats?.success_rate ?? 0).toFixed(1)}%`}
          icon={CheckCircle2}
          href="/trader/statistics"
          tone={statCardToneAt(2)}
        />
        <StatCard
          title="Active Requisites"
          value={statsLoading ? '...' : (stats?.active_requisites ?? 0)}
          icon={CreditCard}
          href="/trader/requisites"
          tone={statCardToneAt(3)}
        />
      </div>

      <TraderDashboardWalletListSection />
    </div>
  );
}
