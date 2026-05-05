'use client';

import { useQuery } from '@tanstack/react-query';
import { Percent, Info } from 'lucide-react';
import { api } from '@/lib/api';
import { internalPaths } from '@/lib/internal-api';
import { merchantKeys } from '@/lib/query-keys';
import { Badge } from '@/components/ui/badge';
import { currencyCodeFromUnknown } from '@/lib/currency-code';

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
  currency: unknown;
  minAmount: unknown;
  maxAmount: unknown;
  defaultCommissionPercent: unknown;
  isActive: boolean;
  commissionTiers: CommissionTier[];
  paymentMethod: { id: string; name: string; displayName?: string } | null;
}

/** Platform-wide direction (fallback when merchant has no custom MerchantDirection rows). */
interface PlatformDirectionRow {
  id: string;
  name: string;
  type: string;
  fromCurrency: string;
  toCurrency: string;
  percentFee: unknown;
  minAmount: unknown;
  maxAmount: unknown;
  isOnline: boolean;
}

function num(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return Number(v);
  return Number(v);
}

export default function MerchantDirectionsPage() {
  const { data: customDirections = [], isLoading: customLoading } = useQuery({
    queryKey: merchantKeys.directions(),
    queryFn: () => api.get<MerchantDirectionRow[]>(internalPaths.merchantDirectionsSelf),
  });

  const usePlatformFallback = !customLoading && customDirections.length === 0;

  const {
    data: platformDirections = [],
    isLoading: platformLoading,
    isError: platformError,
  } = useQuery({
    queryKey: merchantKeys.directionsPlatformDefaults(),
    queryFn: () => api.get<PlatformDirectionRow[]>(internalPaths.directions),
    enabled: usePlatformFallback,
  });

  const showCustom = customDirections.length > 0;
  const loading = customLoading || (!showCustom && platformLoading);

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

      {showCustom && (
        <div className="rounded-lg border border-border-primary/60 bg-bg-secondary/30 px-3 py-2 text-xs text-text-muted">
          Showing <span className="text-text-secondary font-medium">custom terms</span> configured
          for your account.
        </div>
      )}

      {!showCustom &&
        !loading &&
        !platformError &&
        platformDirections.length > 0 && (
          <div className="rounded-lg border border-border-primary/60 bg-bg-secondary/30 px-3 py-2 text-xs text-text-muted">
            You have no merchant-specific terms. The list below reflects{' '}
            <span className="text-text-secondary font-medium">platform default directions</span>.
          </div>
        )}

      {loading && (
        <div className="grid gap-4">
          {[1, 2].map((i) => (
            <div
              key={i}
              className="h-40 rounded-xl border border-border-primary bg-bg-card"
            />
          ))}
        </div>
      )}

      {!loading && showCustom &&
        customDirections.map((dir) => {
          const dirCurrency = currencyCodeFromUnknown(dir.currency);
          return (
          <div
            key={dir.id}
            className="rounded-xl border border-border-primary bg-bg-card p-5 space-y-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge color={dir.directionType === 'PAYIN' ? 'blue' : 'yellow'}>
                  {DIR_LABELS[dir.directionType] ?? dir.directionType}
                </Badge>
                <span className="font-mono font-semibold text-text-primary">{dirCurrency}</span>
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
                  {dirCurrency}
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
          );
        })}

      {!loading &&
        !showCustom &&
        platformError && (
          <div className="rounded-xl border border-border-primary bg-bg-card p-8 text-center text-sm text-text-muted">
            Could not load platform default directions. Try again later or contact support.
          </div>
        )}

      {!loading && !showCustom && !platformError && platformDirections.length === 0 && (
        <div className="rounded-xl border border-border-primary bg-bg-card p-8 text-center text-sm text-text-muted">
          No directions are configured on the platform yet. Contact support.
        </div>
      )}

      {!loading &&
        !showCustom &&
        !platformError &&
        platformDirections.map((dir) => (
          <div
            key={dir.id}
            className="rounded-xl border border-border-primary bg-bg-card p-5 space-y-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge color={dir.type === 'PAYIN' ? 'blue' : 'yellow'}>
                  {DIR_LABELS[dir.type] ?? dir.type}
                </Badge>
                <span className="font-semibold text-text-primary">{dir.name}</span>
                <span className="font-mono text-sm text-text-secondary">
                  {dir.fromCurrency} → {dir.toCurrency}
                </span>
                <Badge color={dir.isOnline ? 'green' : 'red'}>
                  {dir.isOnline ? 'online' : 'offline'}
                </Badge>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 text-sm">
              <div>
                <p className="text-text-muted text-xs mb-1">Amount range</p>
                <p className="text-text-primary font-mono">
                  {num(dir.minAmount).toLocaleString()} — {num(dir.maxAmount).toLocaleString()}{' '}
                  {dir.fromCurrency}
                </p>
              </div>
              <div>
                <p className="text-text-muted text-xs mb-1">Commission</p>
                <p className="text-text-primary font-mono">{num(dir.percentFee).toFixed(2)}%</p>
              </div>
              <div>
                <p className="text-text-muted text-xs mb-1">Pricing tiers</p>
                <p className="text-text-primary">—</p>
              </div>
            </div>
          </div>
        ))}
    </div>
  );
}
