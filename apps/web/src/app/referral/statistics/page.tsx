'use client';

import { useQuery } from '@tanstack/react-query';
import {
  BarChart3,
  TrendingUp,
  Store,
  Wallet,
  ArrowDownToLine,
  ArrowUpFromLine,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { internalPaths } from '@/lib/internal-api';
import { referralKeys } from '@/lib/query-keys';
import { formatCurrency, cn } from '@/lib/utils';
import { currencyCodeFromUnknown } from '@/lib/currency-code';

interface TraderStat {
  userId: string;
  email: string;
  isActive: boolean;
  traderId: string;
  traderActive: boolean;
  balances: { currency: string; amount: number }[];
  completedPayins: number;
  totalPayinAmount: number;
  completedPayouts: number;
  totalPayoutAmount: number;
}

interface MerchantStat {
  userId: string;
  email: string;
  isActive: boolean;
  merchantId: string;
  merchantName: string;
  isLock: boolean;
  balances: { currency: string; amount: number }[];
}

interface Statistics {
  referralProfileId: string;
  referralPercent: number;
  balance: number;
  currency: string;
  totalReferred: number;
  traders: TraderStat[];
  merchants: MerchantStat[];
}

export default function ReferralStatisticsPage() {
  const { data, isLoading } = useQuery({
    queryKey: referralKeys.statistics(),
    queryFn: () => api.get<Statistics>(internalPaths.referralMeStatistics),
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BarChart3 className="h-6 w-6 text-accent-blue" />
          <div>
            <h1 className="text-2xl font-bold text-text-primary">Referral Statistics</h1>
            <p className="text-sm text-text-muted">
              Detailed breakdown of your referred users' activity
            </p>
          </div>
        </div>
        <a href="/referral" className="text-sm text-text-muted hover:text-text-primary">
          ← Back to dashboard
        </a>
      </div>

      {/* Summary row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-border-primary bg-bg-secondary p-4">
          <p className="text-xs text-text-muted">My Balance</p>
          <p className="mt-1 text-xl font-bold text-accent-green">
            {formatCurrency(data?.balance ?? 0, data?.currency ?? 'UAH')}
          </p>
          <p className="text-xs text-text-muted">{data?.referralPercent ?? 0}% commission rate</p>
        </div>
        <div className="rounded-xl border border-border-primary bg-bg-secondary p-4">
          <p className="text-xs text-text-muted">Referred Traders</p>
          <p className="mt-1 text-xl font-bold text-text-primary">{data?.traders.length ?? 0}</p>
        </div>
        <div className="rounded-xl border border-border-primary bg-bg-secondary p-4">
          <p className="text-xs text-text-muted">Referred Merchants</p>
          <p className="mt-1 text-xl font-bold text-text-primary">{data?.merchants.length ?? 0}</p>
        </div>
      </div>

      {/* Traders section */}
      {(data?.traders.length ?? 0) > 0 && (
        <Card>
          <div className="mb-4 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-accent-blue" />
            <h2 className="text-base font-semibold text-text-primary">Traders</h2>
            <span className="text-sm text-text-muted">({data?.traders.length})</span>
          </div>
          <div className="space-y-3">
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-20 animate-pulse rounded-lg bg-bg-secondary" />
              ))
            ) : (
              data?.traders.map((trader) => (
                <TraderCard key={trader.traderId} trader={trader} />
              ))
            )}
          </div>
        </Card>
      )}

      {/* Merchants section */}
      {(data?.merchants.length ?? 0) > 0 && (
        <Card>
          <div className="mb-4 flex items-center gap-2">
            <Store className="h-4 w-4 text-accent-orange" />
            <h2 className="text-base font-semibold text-text-primary">Merchants</h2>
            <span className="text-sm text-text-muted">({data?.merchants.length})</span>
          </div>
          <div className="space-y-3">
            {isLoading ? (
              Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="h-16 animate-pulse rounded-lg bg-bg-secondary" />
              ))
            ) : (
              data?.merchants.map((merchant) => (
                <MerchantCard key={merchant.merchantId} merchant={merchant} />
              ))
            )}
          </div>
        </Card>
      )}

      {!isLoading && data?.totalReferred === 0 && (
        <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-border-primary">
          <p className="text-text-muted">No referred users yet</p>
        </div>
      )}
    </div>
  );
}

function TraderCard({ trader }: { trader: TraderStat }) {
  const normBalances = trader.balances
    .map((b) => ({
      code: currencyCodeFromUnknown((b as { currency: unknown }).currency),
      amount: b.amount,
    }))
    .filter((b) => b.code.length > 0);

  const primaryFiatBalanceRow = normBalances.find((b) => b.code.toUpperCase() === 'UAH');
  const usdtBalance = normBalances.find((b) => b.code.toUpperCase() === 'USDT');

  return (
    <div className="rounded-lg border border-border-primary bg-bg-secondary/50 p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-medium text-text-primary">{trader.email}</p>
          <p className="text-xs text-text-muted font-mono">{trader.traderId.slice(0, 8)}…</p>
        </div>
        <div className="flex gap-2">
          <Badge variant={trader.isActive ? 'success' : 'default'} dot>
            {trader.isActive ? 'Active' : 'Inactive'}
          </Badge>
          <Badge variant={trader.traderActive ? 'success' : 'default'}>
            {trader.traderActive ? 'Trading' : 'Paused'}
          </Badge>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric
          icon={<Wallet className="h-4 w-4 text-text-muted" />}
          label={
            primaryFiatBalanceRow?.code
              ? `Balance (${primaryFiatBalanceRow.code})`
              : 'Fiat balance'
          }
          value={formatCurrency(primaryFiatBalanceRow?.amount ?? 0, primaryFiatBalanceRow?.code ?? 'UAH')}
        />
        <Metric
          icon={<Wallet className="h-4 w-4 text-text-muted" />}
          label="Balance USDT"
          value={formatCurrency(usdtBalance?.amount ?? 0, 'USDT')}
        />
        <Metric
          icon={<ArrowDownToLine className="h-4 w-4 text-accent-green" />}
          label="Pay-In (completed)"
          value={`${trader.completedPayins} / ${formatCurrency(trader.totalPayinAmount, 'UAH')}`}
        />
        <Metric
          icon={<ArrowUpFromLine className="h-4 w-4 text-accent-blue" />}
          label="Pay-Out (completed)"
          value={`${trader.completedPayouts} / ${formatCurrency(trader.totalPayoutAmount, 'UAH')}`}
        />
      </div>
    </div>
  );
}

function MerchantCard({ merchant }: { merchant: MerchantStat }) {
  const rows = merchant.balances
    .map((b) => ({
      code: currencyCodeFromUnknown((b as { currency: unknown }).currency),
      amount: b.amount,
    }))
    .filter((b) => b.code.length > 0);

  return (
    <div className="rounded-lg border border-border-primary bg-bg-secondary/50 p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-medium text-text-primary">{merchant.merchantName}</p>
          <p className="text-xs text-text-muted">{merchant.email}</p>
        </div>
        <div className="flex gap-2">
          <Badge variant={merchant.isActive ? 'success' : 'default'} dot>
            {merchant.isActive ? 'Active' : 'Inactive'}
          </Badge>
          {merchant.isLock && (
            <Badge variant="danger">Locked</Badge>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-3">
        {rows.map((b) => (
          <div key={b.code} className="flex items-center gap-1.5 rounded-md bg-bg-tertiary px-2 py-1">
            <Wallet className="h-4 w-4 text-text-muted" />
            <span className="text-sm font-medium text-text-primary">
              {formatCurrency(b.amount, b.code)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className={cn('flex flex-col gap-0.5')}>
      <div className="flex items-center gap-1">
        {icon}
        <span className="text-xs text-text-muted">{label}</span>
      </div>
      <span className="text-sm font-medium text-text-primary">{value}</span>
    </div>
  );
}
