'use client';

import { useQuery } from '@tanstack/react-query';
import {
  Wallet,
  ArrowLeftRight,
  CheckCircle,
  TrendingUp,
} from 'lucide-react';
import { api } from '@/lib/api';
import { StatCard } from '@/components/ui/stat-card';
import { useAuth } from '@/hooks/use-auth';

interface MerchantBalance {
  currency: string;
  available: number;
  frozen: number;
}

interface MerchantStats {
  ordersToday: number;
  successRate: number;
  totalVolume: number;
}

export default function MerchantDashboard() {
  const { user } = useAuth();

  const { data: balances = [], isLoading: balancesLoading } = useQuery<MerchantBalance[]>({
    queryKey: ['merchant', 'balances'],
    queryFn: () => api.get('/api/merchant/balances'),
  });

  const { data: stats, isLoading: statsLoading } = useQuery<MerchantStats>({
    queryKey: ['merchant', 'stats'],
    queryFn: () => api.get('/api/merchant/stats'),
  });

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Dashboard</h1>
        <p className="text-sm text-text-muted mt-1">
          Welcome back{user?.email ? `, ${user.email}` : ''}
        </p>
      </div>

      <div>
        <h2 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
          <Wallet size={18} />
          Balances
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {balancesLoading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="bg-bg-card border border-border-primary rounded-xl p-5 animate-pulse-soft"
              >
                <div className="h-4 w-16 bg-bg-tertiary rounded mb-2" />
                <div className="h-7 w-24 bg-bg-tertiary rounded" />
              </div>
            ))
          ) : balances.length > 0 ? (
            balances.map((b) => (
              <div
                key={b.currency}
                className="bg-bg-card border border-border-primary rounded-xl p-5"
              >
                <p className="text-sm text-text-muted mb-1">{b.currency}</p>
                <p className="text-2xl font-bold text-text-primary font-mono">
                  {b.available.toLocaleString()}
                </p>
                {b.frozen > 0 && (
                  <p className="text-xs text-accent-yellow mt-1">
                    Frozen: {b.frozen.toLocaleString()}
                  </p>
                )}
              </div>
            ))
          ) : (
            <div className="col-span-full bg-bg-card border border-border-primary rounded-xl p-8 text-center text-text-muted text-sm">
              No balances available
            </div>
          )}
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold text-text-primary mb-4">
          Today&apos;s Performance
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard
            label="Orders Today"
            value={statsLoading ? '...' : String(stats?.ordersToday ?? 0)}
            icon={ArrowLeftRight}
          />
          <StatCard
            label="Success Rate"
            value={
              statsLoading ? '...' : `${(stats?.successRate ?? 0).toFixed(1)}%`
            }
            icon={CheckCircle}
          />
          <StatCard
            label="Total Volume"
            value={
              statsLoading
                ? '...'
                : `$${(stats?.totalVolume ?? 0).toLocaleString()}`
            }
            icon={TrendingUp}
          />
        </div>
      </div>
    </div>
  );
}
