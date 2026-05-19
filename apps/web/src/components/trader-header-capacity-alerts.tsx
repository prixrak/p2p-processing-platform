'use client';

import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Wallet } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { clsx } from 'clsx';
import { api } from '@/lib/api';
import { internalPaths } from '@/lib/internal-api';
import { traderKeys } from '@/lib/query-keys';
import { Tooltip } from '@/components/ui/tooltip';

interface TraderUsdtWalletSummary {
  effective_available_for_payin_usdt?: number;
  available_for_payin_usdt: number;
  pending_payin_usdt_debit_usdt?: number;
  overdraft_limit_usdt: number;
  balance_usdt?: number;
  low_payin_capacity_alert?: boolean;
  payin_capacity_exhausted?: boolean;
  payin_low_capacity_alert_threshold_usdt?: number;
}

function formatUsdt(n: number): string {
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

export function TraderHeaderCapacityAlerts() {
  const t = useTranslations('Trader.HeaderCapacity');
  const { data: wallet } = useQuery({
    queryKey: traderKeys.usdtWallet(),
    queryFn: () => api.get<TraderUsdtWalletSummary>(internalPaths.traderUsdtWallet),
    staleTime: 15_000,
  });

  if (!wallet) return null;

  const effective =
    wallet.effective_available_for_payin_usdt ?? wallet.available_for_payin_usdt;
  const exhausted = !!wallet.payin_capacity_exhausted;
  const low = !!wallet.low_payin_capacity_alert && !exhausted;

  if (!exhausted && !low) return null;

  const pending = wallet.pending_payin_usdt_debit_usdt ?? 0;
  const threshold = wallet.payin_low_capacity_alert_threshold_usdt ?? 200;

  const tooltip = exhausted
    ? t('exhaustedTooltip', {
        available: formatUsdt(effective),
        pending: formatUsdt(pending),
      })
    : t('lowTooltip', {
        available: formatUsdt(effective),
        threshold: formatUsdt(threshold),
        pending: formatUsdt(pending),
      });

  const label = exhausted ? t('exhaustedLabel') : t('lowLabel', { available: formatUsdt(effective) });

  return (
    <Tooltip content={tooltip} side="bottom" wide>
      <Link
        href="/trader/balance"
        className={clsx(
          'inline-flex max-w-[min(100%,28rem)] shrink-0 items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors sm:text-sm',
          exhausted
            ? 'bg-red-950/70 text-red-300 ring-1 ring-red-500/40 hover:bg-red-950/90'
            : 'bg-amber-950/60 text-amber-200 ring-1 ring-amber-500/35 hover:bg-amber-950/80',
        )}
      >
        {exhausted ? (
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
        ) : (
          <Wallet className="h-4 w-4 shrink-0 opacity-90" aria-hidden />
        )}
        <span className="truncate sm:max-w-none max-w-[8rem]">{label}</span>
      </Link>
    </Tooltip>
  );
}
