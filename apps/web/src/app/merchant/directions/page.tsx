'use client';

import { useQuery } from '@tanstack/react-query';
import { Percent, Info } from 'lucide-react';
import { api } from '@/lib/api';
import { internalPaths } from '@/lib/internal-api';
import { merchantKeys } from '@/lib/query-keys';
import { Badge } from '@/components/ui/badge';

const DIR_LABELS: Record<string, string> = { PAYIN: 'Pay-In', PAYOUT: 'Pay-Out' };

interface CommissionTier {
  id: string;
  amountFrom: unknown;
  amountTo: unknown | null;
  commissionPercent: unknown;
}

interface MerchantDirectionRow {
  id: string;
  directionType: string;
  currency: string;
  minAmount: unknown;
  maxAmount: unknown;
  defaultCommissionPercent: unknown;
  isActive: boolean;
  commissionTiers: CommissionTier[];
  paymentMethod: { id: string; name: string; displayName?: string } | null;
}

function num(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return Number(v);
  return Number(v);
}

export default function MerchantDirectionsPage() {
  const { data: directions = [], isLoading } = useQuery({
    queryKey: merchantKeys.directions(),
    queryFn: () => api.get<MerchantDirectionRow[]>(internalPaths.merchantDirectionsSelf),
  });

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
          <Percent size={24} />
          Directions & commissions
        </h1>
        <p className="text-sm text-text-muted mt-1">
          Your Pay-In and Pay-Out direction parameters and commission structure (read-only).
        </p>
      </div>

      <div className="flex gap-3 rounded-xl border border-border-primary bg-bg-secondary/50 p-4 text-sm text-text-secondary">
        <Info className="h-5 w-5 shrink-0 text-accent-blue" />
        <p>
          Terms are configured by the platform. If you need changes, contact your account manager or
          support.
        </p>
      </div>

      {isLoading && (
        <div className="grid gap-4">
          {[1, 2].map((i) => (
            <div
              key={i}
              className="h-40 rounded-xl border border-border-primary bg-bg-card"
            />
          ))}
        </div>
      )}

      {!isLoading && directions.length === 0 && (
        <div className="rounded-xl border border-border-primary bg-bg-card p-8 text-center text-sm text-text-muted">
          No directions configured for your account — global defaults may apply. Contact support if
          you expect custom terms.
        </div>
      )}

      {!isLoading &&
        directions.map((dir) => (
          <div
            key={dir.id}
            className="rounded-xl border border-border-primary bg-bg-card p-5 space-y-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge color={dir.directionType === 'PAYIN' ? 'blue' : 'yellow'}>
                  {DIR_LABELS[dir.directionType] ?? dir.directionType}
                </Badge>
                <span className="font-mono font-semibold text-text-primary">{dir.currency}</span>
                <Badge color={dir.isActive ? 'green' : 'red'}>
                  {dir.isActive ? 'active' : 'inactive'}
                </Badge>
              </div>
              {dir.paymentMethod && (
                <span className="text-xs text-text-muted">
                  Payment method:{' '}
                  <span className="text-text-secondary">
                    {dir.paymentMethod.displayName ?? dir.paymentMethod.name}
                  </span>
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 text-sm">
              <div>
                <p className="text-text-muted text-xs mb-1">Amount range</p>
                <p className="text-text-primary font-mono">
                  {num(dir.minAmount).toLocaleString()} — {num(dir.maxAmount).toLocaleString()}{' '}
                  {dir.currency}
                </p>
              </div>
              <div>
                <p className="text-text-muted text-xs mb-1">Default commission</p>
                <p className="text-text-primary font-mono">
                  {num(dir.defaultCommissionPercent).toFixed(2)}%
                </p>
              </div>
              <div>
                <p className="text-text-muted text-xs mb-1">Pricing tiers</p>
                <p className="text-text-primary">{dir.commissionTiers.length}</p>
              </div>
            </div>

            {dir.commissionTiers.length > 0 && (
              <div className="border-t border-border-primary pt-4">
                <p className="text-xs text-text-muted mb-2">Commission tiers</p>
                <div className="space-y-2">
                  {dir.commissionTiers.map((t) => (
                    <div
                      key={t.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-bg-secondary px-3 py-2 text-xs font-mono text-text-secondary"
                    >
                      <span>
                        {num(t.amountFrom).toLocaleString()} —{' '}
                        {t.amountTo != null ? num(t.amountTo).toLocaleString() : '∞'}
                      </span>
                      <span className="text-accent-green">{num(t.commissionPercent).toFixed(2)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
    </div>
  );
}
