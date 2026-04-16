'use client';

import { useQuery } from '@tanstack/react-query';
import { Wallet } from 'lucide-react';
import { api } from '@/lib/api';

interface BalanceRow {
  currency: string;
  available: number;
  frozen: number;
}

export default function MerchantBalancesPage() {
  const { data: balances = [], isLoading: balancesLoading } = useQuery<BalanceRow[]>({
    queryKey: ['merchant', 'balances'],
    queryFn: () => api.get('/api/merchant/balances'),
  });

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
          <Wallet size={24} />
          Balances
        </h1>
        <p className="text-sm text-text-muted mt-1">
          Per-currency available and frozen balances.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {balancesLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="bg-bg-card border border-border-primary rounded-xl p-5 animate-pulse-soft"
            >
              <div className="h-4 w-16 bg-bg-tertiary rounded mb-3" />
              <div className="h-7 w-24 bg-bg-tertiary rounded mb-2" />
              <div className="h-3 w-20 bg-bg-tertiary rounded" />
            </div>
          ))
        ) : (
          balances.map((b) => {
            const frozen = b.frozen ?? 0;
            return (
              <div
                key={b.currency}
                className="bg-bg-card border border-border-primary rounded-xl p-5"
              >
                <p className="text-sm text-text-muted mb-1">{b.currency}</p>
                <p className="text-xs text-text-muted uppercase tracking-wide mb-0.5">Available</p>
                <p className="text-2xl font-bold text-text-primary font-mono">
                  {b.available.toLocaleString()}
                </p>
                <div className="mt-2 text-xs text-text-muted">
                  Frozen:{' '}
                  <span className={frozen > 0 ? 'text-accent-yellow font-mono' : 'font-mono text-text-secondary'}>
                    {frozen.toLocaleString()}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
