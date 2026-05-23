'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { ArrowDownCircle, ArrowUpCircle, DollarSign, MinusCircle } from 'lucide-react';
import { ListPageRefreshButton } from '@/components/ui/list-page-tools';
import { api } from '@/lib/api';
import { formatErrorMessage } from '@/lib/format-error';
import { internalPaths } from '@/lib/internal-api';
import { traderKeys } from '@/lib/query-keys';
import { Badge } from '@/components/ui/badge';
import { DataTable } from '@/components/ui/data-table';
import { PaginationControls } from '@/components/ui/pagination-controls';
import { FilterBar, FilterInput } from '@/components/ui/filters';
import { Select } from '@/components/ui/select';
import { formatDateTime } from '@/lib/utils';
import { clsx } from 'clsx';

interface BalanceTx {
  id: string;
  type: string;
  amount: string;
  currency: string;
  referenceId: string | null;
  comment: string | null;
  createdAt: string;
  createdBy: { email: string } | null;
  /** TOP_UP only — set when this row links to a monitored on-chain deposit. */
  on_chain_deposit_status?: string | null;
}

interface UsdtWallet {
  balance_usdt: number;
  overdraft_limit_usdt: number;
  display_own_usdt: number;
  available_for_payin_usdt: number;
  effective_available_for_payin_usdt?: number;
  pending_payin_usdt_debit_usdt?: number;
  payin_capacity_exhausted?: boolean;
  work_mode: string;
  usdt_trc20_deposit_address: string | null;
  usdt_erc20_deposit_address: string | null;
  /** Operator-configured threshold; alert when effective headroom is at or below this. */
  payin_low_capacity_alert_threshold_usdt?: number;
  low_payin_capacity_alert?: boolean;
}

function topUpFulfillmentLabel(tx: BalanceTx, t: (k: string) => string): string {
  if (tx.type !== 'TOP_UP') return t('dash');
  if (tx.on_chain_deposit_status) {
    const s = tx.on_chain_deposit_status;
    return s.replace(/_/g, ' ');
  }
  return t('administrative');
}

const TX_TYPE_COLOR: Record<string, 'green' | 'red' | 'blue' | 'yellow'> = {
  PAYIN_COMMISSION: 'green',
  PAYIN_DEBIT: 'red',
  PAYOUT_CREDIT: 'green',
  PAYOUT_DEBIT: 'red',
  SETTLEMENT: 'blue',
  MANUAL_CREDIT: 'green',
  TOP_UP: 'green',
  OVERDRAFT_SET: 'yellow',
  MANUAL_DEBIT: 'red',
};

const isCredit = (type: string) =>
  ['PAYIN_COMMISSION', 'PAYOUT_CREDIT', 'TOP_UP', 'MANUAL_CREDIT', 'SETTLEMENT'].includes(type);

const isNeutralTx = (type: string) => type === 'OVERDRAFT_SET';

export default function BalanceHistoryPage() {
  const t = useTranslations('Trader.Balance');
  const queryClient = useQueryClient();
  const [currency, setCurrency] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [txType, setTxType] = useState<string>('');

  const txTypeLabels = useMemo(
    () => ({
      PAYIN_COMMISSION: t('txTypes.PAYIN_COMMISSION'),
      PAYIN_DEBIT: t('txTypes.PAYIN_DEBIT'),
      PAYOUT_DEBIT: t('txTypes.PAYOUT_DEBIT'),
      PAYOUT_CREDIT: t('txTypes.PAYOUT_CREDIT'),
      TOP_UP: t('txTypes.TOP_UP'),
      OVERDRAFT_SET: t('txTypes.OVERDRAFT_SET'),
      SETTLEMENT: t('txTypes.SETTLEMENT'),
      MANUAL_CREDIT: t('txTypes.MANUAL_CREDIT'),
      MANUAL_DEBIT: t('txTypes.MANUAL_DEBIT'),
    }),
    [t],
  );

  const {
    data: wallet,
    isLoading: walletLoading,
    isError: walletError,
    error: walletErrorDetail,
    isFetching: walletFetching,
  } = useQuery({
    queryKey: traderKeys.usdtWallet(),
    queryFn: () => api.get<UsdtWallet>(internalPaths.traderUsdtWallet),
  });

  const { data, isLoading, isFetching: transactionsFetching } = useQuery({
    queryKey: traderKeys.balanceTransactions(page, currency, dateFrom, dateTo, txType),
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), limit: '30' });
      if (currency) params.set('currency', currency);
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);
      if (txType) params.set('type', txType);
      return api.get<{ data: BalanceTx[]; total: number; page: number; limit: number }>(
        `${internalPaths.balanceTransactions}?${params}`,
      );
    },
  });

  const txList = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / 30));

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const threshold = wallet?.payin_low_capacity_alert_threshold_usdt ?? 200;
  const effectiveAvailable =
    wallet?.effective_available_for_payin_usdt ?? wallet?.available_for_payin_usdt;
  const showExhaustedBanner = !!wallet?.payin_capacity_exhausted;
  const showLowCapacityBanner = !!wallet?.low_payin_capacity_alert && !showExhaustedBanner;

  const columns = useMemo(
    () => [
      {
        key: 'type',
        header: t('colType'),
        render: (tx: BalanceTx) => (
          <div className="flex items-center gap-2">
            {isNeutralTx(tx.type) ? (
              <MinusCircle className="h-4 w-4 shrink-0 text-accent-yellow" />
            ) : isCredit(tx.type) ? (
              <ArrowDownCircle className="h-4 w-4 shrink-0 text-green-500" />
            ) : (
              <ArrowUpCircle className="h-4 w-4 shrink-0 text-red-500" />
            )}
            <Badge color={TX_TYPE_COLOR[tx.type] ?? 'blue'}>
              {txTypeLabels[tx.type as keyof typeof txTypeLabels] ?? tx.type}
            </Badge>
          </div>
        ),
      },
      {
        key: 'status',
        header: t('colStatus'),
        render: (tx: BalanceTx) => (
          <span className="text-xs text-text-secondary">{topUpFulfillmentLabel(tx, t)}</span>
        ),
      },
      {
        key: 'amount',
        header: t('colAmount'),
        className: 'text-end tabular-nums',
        render: (tx: BalanceTx) => (
          <span
            className={`font-mono font-semibold ${
              isNeutralTx(tx.type)
                ? 'text-text-secondary'
                : isCredit(tx.type)
                  ? 'text-green-400'
                  : 'text-red-400'
            }`}
          >
            {isNeutralTx(tx.type) ? '' : isCredit(tx.type) ? '+' : '−'}
            {Number(tx.amount).toLocaleString()} {tx.currency}
            {isNeutralTx(tx.type) ? (
              <span className="mt-0 block text-[10px] font-normal text-text-muted">{t('newLimit')}</span>
            ) : null}
          </span>
        ),
      },
      {
        key: 'comment',
        header: t('colComment'),
        render: (tx: BalanceTx) => (
          <span className="text-sm text-text-secondary">
            {tx.comment ||
              (tx.referenceId ? (
                <span className="font-mono text-xs">{tx.referenceId.slice(0, 8)}…</span>
              ) : (
                t('dash')
              ))}
          </span>
        ),
      },
      {
        key: 'createdBy',
        header: t('colBy'),
        render: (tx: BalanceTx) => (
          <span className="text-xs text-text-muted">{tx.createdBy?.email ?? t('system')}</span>
        ),
      },
      {
        key: 'createdAt',
        header: t('colTime'),
        render: (tx: BalanceTx) => (
          <span className="text-xs text-text-muted">{formatDateTime(new Date(tx.createdAt))}</span>
        ),
      },
    ],
    [t, txTypeLabels],
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-text-primary">
            <DollarSign className="h-6 w-6" /> {t('title')}
          </h1>
          <p className="mt-1 text-sm text-text-muted">{t('subtitle')}</p>
        </div>
        <ListPageRefreshButton
          isRefreshing={walletFetching || transactionsFetching}
          onRefresh={() => {
            void queryClient.invalidateQueries({ queryKey: traderKeys.usdtWallet() });
            void queryClient.invalidateQueries({ queryKey: traderKeys.balanceTransactionsScope });
          }}
        />
      </div>

      {showExhaustedBanner ? (
        <div className="rounded-xl border border-red-500/35 bg-red-500/10 px-4 py-3 text-sm text-red-950 dark:border-red-400/35 dark:text-red-100">
          <p className="font-medium">{t('capacityExhaustedTitle')}</p>
          <p className="mt-1 text-xs leading-relaxed opacity-95">
            {t('capacityExhaustedIntro')}{' '}
            <span className="font-mono">{effectiveAvailable!.toLocaleString()} USDT</span>{' '}
            {t('capacityExhaustedOutro')}{' '}
            <a href="#wallet-deposit-instructions" className="font-medium underline">
              {t('lowCapacityDepositLink')}
            </a>
            .
          </p>
        </div>
      ) : null}

      {showLowCapacityBanner ? (
        <div className="rounded-xl border border-amber-500/35 bg-amber-500/10 px-4 py-3 text-sm text-amber-950 dark:border-amber-400/35 dark:text-amber-100">
          <p className="font-medium">{t('lowCapacityTitle')}</p>
          <p className="mt-1 text-xs leading-relaxed opacity-95">
            {t('lowCapacityIntro')}{' '}
            <span className="font-mono">{effectiveAvailable!.toLocaleString()} USDT</span>
            {Number.isFinite(threshold) ? (
              <>
                {' '}
                {t('lowCapacityAlert')}{' '}
                <span className="font-mono">{threshold.toLocaleString()} USDT</span>
                {t('lowCapacityMid')}
              </>
            ) : null}
            {t('lowCapacityOutro')}{' '}
            <a href="#wallet-deposit-instructions" className="font-medium underline">
              {t('lowCapacityDepositLink')}
            </a>{' '}
            {t('lowCapacityFooter')}
          </p>
        </div>
      ) : null}

      <section
        id="wallet-deposit-instructions"
        className="scroll-mt-24 space-y-4 rounded-xl border border-border-subtle bg-bg-secondary p-4"
      >
        <h2 className="text-sm font-semibold text-text-primary">{t('usdtWalletHeading')}</h2>
        {walletError ? (
          <div className="space-y-1 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-950 dark:text-red-100">
            <p className="font-medium">{t('walletErrorTitle')}</p>
            <p className="text-xs opacity-90">{formatErrorMessage(walletErrorDetail)}</p>
            <p className="text-xs opacity-85">{t('walletErrorHint')}</p>
          </div>
        ) : walletLoading || !wallet ? (
          <p className="text-sm text-text-muted">{t('loading')}</p>
        ) : (
          <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="text-xs text-text-muted">{t('operatingMode')}</p>
              <p className="font-mono text-text-primary">{wallet.work_mode.replace(/_/g, ' ')}</p>
            </div>
            <div>
              <p className="text-xs text-text-muted">{t('overdraftLimit')}</p>
              <p className="font-mono text-text-primary">{wallet.overdraft_limit_usdt.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-xs text-text-muted">{t('ownBalance')}</p>
              <p className="font-mono text-text-primary">{wallet.display_own_usdt.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-xs text-text-muted">{t('availablePayin')}</p>
              <p className="font-mono text-accent-green">{wallet.available_for_payin_usdt.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-xs text-text-muted">{t('effectiveAvailablePayin')}</p>
              <p
                className={clsx(
                  'font-mono',
                  wallet.payin_capacity_exhausted ? 'text-red-400' : 'text-text-primary',
                )}
              >
                {(wallet.effective_available_for_payin_usdt ?? wallet.available_for_payin_usdt).toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-xs text-text-muted">{t('pendingPayinReserve')}</p>
              <p className="font-mono text-text-primary">
                {(wallet.pending_payin_usdt_debit_usdt ?? 0).toLocaleString()}
              </p>
            </div>
            <div className="sm:col-span-2">
              <p className="text-xs text-text-muted">{t('ledgerUsdt')}</p>
              <p className="font-mono text-text-primary">{wallet.balance_usdt.toLocaleString()}</p>
            </div>
          </div>
        )}

        <div className="space-y-2 border-t border-border-subtle pt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-text-primary">
            {t('depositTrcHeading')}
          </h3>
          <p className="text-xs text-text-muted">{t('depositTrcHelp')}</p>
          {wallet?.usdt_trc20_deposit_address ? (
            <p className="break-all rounded-lg bg-bg-primary/50 p-2 font-mono text-xs text-text-secondary">
              {wallet.usdt_trc20_deposit_address}
            </p>
          ) : (
            <p className="text-xs text-text-muted">{t('noDepositAddress')}</p>
          )}
        </div>

        <div className="space-y-2 border-t border-border-subtle pt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-text-primary">
            {t('depositErcHeading')}
          </h3>
          <p className="text-xs text-text-muted">{t('depositErcHelp')}</p>
          {wallet?.usdt_erc20_deposit_address ? (
            <p className="break-all rounded-lg bg-bg-primary/50 p-2 font-mono text-xs text-text-secondary">
              {wallet.usdt_erc20_deposit_address}
            </p>
          ) : (
            <p className="text-xs text-text-muted">{t('noDepositAddress')}</p>
          )}
        </div>
      </section>

      <div>
        <h2 className="mb-2 text-lg font-semibold text-text-primary">{t('ledgerHeading')}</h2>
        <p className="mb-3 text-sm text-text-muted">{t('ledgerSub')}</p>
      </div>

      <FilterBar>
        <div className="w-48">
          <Select
            label={t('filterType')}
            options={[
              { value: '', label: t('allTypes') },
              { value: 'TOP_UP', label: txTypeLabels.TOP_UP },
              { value: 'PAYIN_DEBIT', label: txTypeLabels.PAYIN_DEBIT },
              { value: 'PAYIN_COMMISSION', label: txTypeLabels.PAYIN_COMMISSION },
              { value: 'PAYOUT_CREDIT', label: txTypeLabels.PAYOUT_CREDIT },
              { value: 'SETTLEMENT', label: txTypeLabels.SETTLEMENT },
              { value: 'MANUAL_CREDIT', label: txTypeLabels.MANUAL_CREDIT },
              { value: 'MANUAL_DEBIT', label: txTypeLabels.MANUAL_DEBIT },
              { value: 'OVERDRAFT_SET', label: txTypeLabels.OVERDRAFT_SET },
            ]}
            value={txType}
            onChange={(e) => {
              setTxType(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <FilterInput
          label={t('filterCurrency')}
          value={currency}
          onChange={(v) => {
            setCurrency(v.toUpperCase());
            setPage(1);
          }}
          placeholder="USDT"
          className="w-32"
        />
        <FilterInput
          type="date"
          label={t('filterFrom')}
          value={dateFrom}
          onChange={(v) => {
            setDateFrom(v);
            setPage(1);
          }}
          className="w-40"
        />
        <FilterInput
          type="date"
          label={t('filterTo')}
          value={dateTo}
          onChange={(v) => {
            setDateTo(v);
            setPage(1);
          }}
          className="w-40"
        />
      </FilterBar>

      <DataTable columns={columns} data={txList} isLoading={isLoading} emptyMessage={t('emptyTx')} />

      <PaginationControls
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        captionOverride={t('paginationCaption', { total, page, totalPages })}
        variant="minimal"
      />
    </div>
  );
}
