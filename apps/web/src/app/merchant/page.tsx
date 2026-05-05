'use client';

import { useQuery } from '@tanstack/react-query';
import {
  Wallet,
  ArrowLeftRight,
  CheckCircle,
  TrendingUp,
} from 'lucide-react';
import { api } from '@/lib/api';
import { internalPaths } from '@/lib/internal-api';
import { merchantKeys } from '@/lib/query-keys';
import { StatCard } from '@/components/ui/stat-card';
import { useAuth } from '@/hooks/use-auth';
import { statCardToneAt, surfaceRingClass } from '@/lib/surface-ring';
import { cn } from '@/lib/utils';
import { currencyCodeFromUnknown } from '@/lib/currency-code';

interface MerchantBalance {
  currency: unknown;
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
    queryKey: merchantKeys.balances(),
    queryFn: () => api.get(internalPaths.merchantBalances),
  });

  const { data: stats, isLoading: statsLoading } = useQuery<MerchantStats>({
    queryKey: merchantKeys.stats(),
    queryFn: () => api.get(internalPaths.merchantStats),
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
                className={cn(
                  'rounded-xl p-5',
                  surfaceRingClass(statCardToneAt(i)),
                )}
              >
                <div className="h-4 w-16 bg-bg-tertiary rounded mb-2" />
                <div className="h-7 w-24 bg-bg-tertiary rounded" />
              </div>
            ))
          ) : balances.length > 0 ? (
            balances.map((b, i) => {
              const curCode = currencyCodeFromUnknown(b.currency);
              return (
              <div
                key={curCode || `balance-${i}`}
                className={cn('rounded-xl p-5', surfaceRingClass(statCardToneAt(i)))}
              >
                <p className="text-sm text-text-muted mb-1">{curCode}</p>
                <p className="text-2xl font-bold text-text-primary font-mono">
                  {b.available.toLocaleString()}
                </p>
                {b.frozen > 0 && (
                  <p className="text-xs text-accent-yellow mt-1">
                    Frozen: {b.frozen.toLocaleString()}
                  </p>
                )}
              </div>
            );
            })
          ) : (
            <div
              className={cn(
                'col-span-full rounded-xl p-8 text-center text-text-muted text-sm',
                surfaceRingClass('neutral'),
              )}
            >
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
            href="/merchant/orders"
            tone={statCardToneAt(0)}
          />
          <StatCard
            label="Success Rate"
            value={
              statsLoading ? '...' : `${(stats?.successRate ?? 0).toFixed(1)}%`
            }
            icon={CheckCircle}
            href="/merchant/analytics"
            tone={statCardToneAt(1)}
          />
          <StatCard
            label="Total Volume"
            value={
              statsLoading
                ? '...'
                : `$${(stats?.totalVolume ?? 0).toLocaleString()}`
            }
            icon={TrendingUp}
            href="/merchant/analytics"
            tone={statCardToneAt(2)}
          />
        </div>
      </div>
    </div>
  );
}
