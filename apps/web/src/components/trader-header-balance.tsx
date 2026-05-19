'use client';

import { useQuery } from '@tanstack/react-query';
import { Wallet } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { clsx } from 'clsx';
import { api } from '@/lib/api';
import { internalPaths } from '@/lib/internal-api';
import { traderKeys } from '@/lib/query-keys';
import { Tooltip } from '@/components/ui/tooltip';

interface TraderUsdtWalletSummary {
  balance_usdt?: number;
  available_for_payin_usdt: number;
  effective_available_for_payin_usdt?: number;
  pending_payin_usdt_debit_usdt?: number;
  payin_capacity_exhausted?: boolean;
}

function formatUsdt(n: number): string {
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function TraderHeaderBalance() {
  const t = useTranslations('Trader.HeaderBalance');
  const { data, isLoading, isError } = useQuery({
    queryKey: traderKeys.usdtWallet(),
    queryFn: () => api.get<TraderUsdtWalletSummary>(internalPaths.traderUsdtWallet),
    staleTime: 15_000,
  });

  const reserved = data?.pending_payin_usdt_debit_usdt ?? 0;
  const available =
    data?.effective_available_for_payin_usdt ?? data?.available_for_payin_usdt;
  const exhausted = !!data?.payin_capacity_exhausted;

  const availableText =
    isLoading || available === undefined ? '…' : isError ? '—' : formatUsdt(available);
  const reservedText = isLoading ? '…' : isError ? '—' : formatUsdt(reserved);

  const tooltip =
    isLoading || isError
      ? t('tooltipLoading')
      : t('tooltip', { available: availableText, reserved: reservedText });

  return (
    <Tooltip content={tooltip} side="bottom" wide>
      <Link
        href="/trader/balance"
        className={clsx(
          'inline-flex max-w-[min(100%,20rem)] shrink-0 items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs transition-colors sm:max-w-none sm:px-3 sm:text-sm',
          'bg-accent-muted/80 ring-1 ring-accent/20 hover:bg-accent-muted dark:bg-accent/15 dark:ring-accent/30',
        )}
        aria-label={t('ariaLabel', { available: availableText, reserved: reservedText })}
      >
        <Wallet className="h-4 w-4 shrink-0 text-accent-hover dark:text-accent" aria-hidden />
        <span className="flex min-w-0 flex-col gap-0.5 leading-tight sm:flex-row sm:items-center sm:gap-2">
          <span className="inline-flex min-w-0 items-baseline gap-1">
            <span className="shrink-0 font-medium text-text-muted">{t('availableShort')}</span>
            <span
              className={clsx(
                'truncate font-mono font-semibold tabular-nums',
                exhausted ? 'text-red-600 dark:text-red-400' : 'text-accent-hover dark:text-accent',
              )}
            >
              {availableText}
            </span>
          </span>
          <span className="hidden text-text-muted/50 sm:inline" aria-hidden>
            ·
          </span>
          <span className="inline-flex min-w-0 items-baseline gap-1">
            <span className="shrink-0 font-medium text-text-muted">{t('reservedShort')}</span>
            <span
              className={clsx(
                'truncate font-mono font-semibold tabular-nums',
                reserved > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-text-secondary',
              )}
            >
              {reservedText}
            </span>
          </span>
        </span>
      </Link>
    </Tooltip>
  );
}
