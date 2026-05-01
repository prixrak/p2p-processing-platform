'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowDownCircle, ArrowUpCircle, DollarSign, MinusCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { formatErrorMessage } from '@/lib/format-error';
import { internalPaths } from '@/lib/internal-api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import { FilterBar, FilterInput } from '@/components/ui/filters';
import { Select } from '@/components/ui/select';

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
  work_mode: string;
  usdt_trc20_deposit_address: string | null;
  usdt_erc20_deposit_address: string | null;
  /** Operator-configured threshold; alert when `available_for_payin_usdt` is at or below this. */
  payin_low_capacity_alert_threshold_usdt?: number;
  low_payin_capacity_alert?: boolean;
}

function topUpFulfillmentLabel(tx: BalanceTx): string {
  if (tx.type !== 'TOP_UP') return '—';
  if (tx.on_chain_deposit_status) {
    const s = tx.on_chain_deposit_status;
    return s.replace(/_/g, ' ');
  }
  return 'Administrative';
}

const TX_TYPE_LABELS: Record<string, string> = {
  PAYIN_COMMISSION: 'Pay-In commission (historical)',
  PAYIN_DEBIT: 'Pay-In USDT debit',
  PAYOUT_DEBIT: 'Pay-Out commission credit (historical)',
  PAYOUT_CREDIT: 'Pay-Out USDT credit',
  TOP_UP: 'Top-up',
  OVERDRAFT_SET: 'Overdraft limit change',
  SETTLEMENT: 'Settlement',
  MANUAL_CREDIT: 'Manual credit',
  MANUAL_DEBIT: 'Manual debit',
};

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
  [
    'PAYIN_COMMISSION',
    'PAYOUT_CREDIT',
    'TOP_UP',
    'MANUAL_CREDIT',
    'SETTLEMENT',
  ].includes(type);

const isNeutralTx = (type: string) => type === 'OVERDRAFT_SET';

export default function BalanceHistoryPage() {
  const [currency, setCurrency] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [txType, setTxType] = useState<string>('');

  const {
    data: wallet,
    isLoading: walletLoading,
    isError: walletError,
    error: walletErrorDetail,
  } = useQuery({
    queryKey: ['trader', 'usdt-wallet'],
    queryFn: () => api.get<UsdtWallet>(internalPaths.traderUsdtWallet),
  });

  const { data, isLoading } = useQuery({
    queryKey: ['trader', 'balance-transactions', page, currency, dateFrom, dateTo, txType],
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
  const totalPages = Math.ceil(total / 30);

  const threshold =
    wallet?.payin_low_capacity_alert_threshold_usdt ?? 200;
  const showLowCapacityBanner = !!wallet?.low_payin_capacity_alert;

  const columns = [
    {
      key: 'type',
      header: 'Type',
      render: (tx: BalanceTx) => (
        <div className="flex items-center gap-2">
          {isNeutralTx(tx.type) ? (
            <MinusCircle className="h-4 w-4 text-accent-yellow shrink-0" />
          ) : isCredit(tx.type) ? (
            <ArrowDownCircle className="h-4 w-4 text-green-500 shrink-0" />
          ) : (
            <ArrowUpCircle className="h-4 w-4 text-red-500 shrink-0" />
          )}
          <Badge color={TX_TYPE_COLOR[tx.type] ?? 'blue'}>
            {TX_TYPE_LABELS[tx.type] ?? tx.type}
          </Badge>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status / fulfillment',
      render: (tx: BalanceTx) => (
        <span className="text-xs text-text-secondary">{topUpFulfillmentLabel(tx)}</span>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
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
            <span className="block text-[10px] text-text-muted font-normal">new limit</span>
          ) : null}
        </span>
      ),
    },
    {
      key: 'comment',
      header: 'Comment / ID',
      render: (tx: BalanceTx) => (
        <span className="text-sm text-text-secondary">
          {tx.comment ||
            (tx.referenceId ? (
              <span className="font-mono text-xs">{tx.referenceId.slice(0, 8)}…</span>
            ) : (
              '—'
            ))}
        </span>
      ),
    },
    {
      key: 'createdBy',
      header: 'By',
      render: (tx: BalanceTx) => (
        <span className="text-xs text-text-muted">{tx.createdBy?.email ?? 'system'}</span>
      ),
    },
    {
      key: 'createdAt',
      header: 'Time',
      render: (tx: BalanceTx) => (
        <span className="text-xs text-text-muted">
          {new Date(tx.createdAt).toLocaleString('en-US')}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
            <DollarSign className="h-6 w-6" /> Balance
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            USDT capacity for Pay-In assignment and full ledger history
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          className="shrink-0 self-start"
          onClick={() =>
            document
              .getElementById('wallet-deposit-instructions')
              ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }
        >
          Top up
        </Button>
      </div>

      {showLowCapacityBanner ? (
        <div className="rounded-xl border border-amber-500/35 bg-amber-500/10 px-4 py-3 text-sm text-amber-950 dark:text-amber-100 dark:border-amber-400/35">
          <p className="font-medium">Low remaining capacity</p>
          <p className="mt-1 text-xs opacity-95 leading-relaxed">
            Available for Pay-In assignment is{' '}
            <span className="font-mono">
              {wallet!.available_for_payin_usdt.toLocaleString()} USDT
            </span>
            {Number.isFinite(threshold) ? (
              <>
                {' '}
                (alert at or below{' '}
                <span className="font-mono">{threshold.toLocaleString()} USDT</span>)
              </>
            ) : null}
            . Consider topping up via{' '}
            <a href="#wallet-deposit-instructions" className="underline font-medium">
              deposit instructions
            </a>{' '}
            before capacity is exhausted or your overdraft limit is reached (operator notifications
            may use Telegram when configured).
          </p>
        </div>
      ) : null}

      <section
        id="wallet-deposit-instructions"
        className="rounded-xl border border-border-subtle bg-bg-secondary p-4 space-y-4 scroll-mt-24"
      >
        <h2 className="text-sm font-semibold text-text-primary">USDT wallet (cabinet)</h2>
        {walletError ? (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-950 dark:text-red-100 space-y-1">
            <p className="font-medium">Could not load USDT wallet</p>
            <p className="text-xs opacity-90">{formatErrorMessage(walletErrorDetail)}</p>
            <p className="text-xs opacity-85">
              Refresh the page or sign in again. If the problem continues, contact support.
            </p>
          </div>
        ) : walletLoading || !wallet ? (
          <p className="text-sm text-text-muted">Loading…</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
            <div>
              <p className="text-text-muted text-xs">Operating mode</p>
              <p className="font-mono text-text-primary">
                {wallet.work_mode.replace(/_/g, ' ')}
              </p>
            </div>
            <div>
              <p className="text-text-muted text-xs">Overdraft limit (USDT)</p>
              <p className="font-mono text-text-primary">
                {wallet.overdraft_limit_usdt.toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-text-muted text-xs">Own balance (display, ≥0)</p>
              <p className="font-mono text-text-primary">
                {wallet.display_own_usdt.toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-text-muted text-xs">Available for Pay-In (balance + limit)</p>
              <p className="font-mono text-accent-green">
                {wallet.available_for_payin_usdt.toLocaleString()}
              </p>
            </div>
            <div className="sm:col-span-2">
              <p className="text-text-muted text-xs">USDT balance (ledger)</p>
              <p className="font-mono text-text-primary">
                {wallet.balance_usdt.toLocaleString()}
              </p>
            </div>
          </div>
        )}

        <div className="border-t border-border-subtle pt-4 space-y-2">
          <h3 className="text-xs font-semibold text-text-primary uppercase tracking-wide">
            USDT TRC-20 deposit address
          </h3>
          <p className="text-xs text-text-muted">
            Operators assign monitored Tron deposit addresses for top-ups. Credits apply after confirmations (worker).
            Contact operations if no address appears or if it must be updated.
          </p>
          {wallet?.usdt_trc20_deposit_address ? (
            <p className="font-mono text-xs break-all text-text-secondary bg-bg-primary/50 rounded-lg p-2">
              {wallet.usdt_trc20_deposit_address}
            </p>
          ) : (
            <p className="text-xs text-text-muted">No deposit address configured yet.</p>
          )}
        </div>

        <div className="border-t border-border-subtle pt-4 space-y-2">
          <h3 className="text-xs font-semibold text-text-primary uppercase tracking-wide">
            USDT ERC-20 deposit address (Ethereum)
          </h3>
          <p className="text-xs text-text-muted">
            Operators assign Ethereum mainnet ERC-20 USDT deposit addresses where on-chain polling is enabled. Contact
            operations if you need a change.
          </p>
          {wallet?.usdt_erc20_deposit_address ? (
            <p className="font-mono text-xs break-all text-text-secondary bg-bg-primary/50 rounded-lg p-2">
              {wallet.usdt_erc20_deposit_address}
            </p>
          ) : (
            <p className="text-xs text-text-muted">No deposit address configured yet.</p>
          )}
        </div>
      </section>

      <div>
        <h2 className="text-lg font-semibold text-text-primary mb-2">Ledger</h2>
        <p className="text-sm text-text-muted mb-3">
          Credits and debits; TOP_UP rows link on-chain deposits after they are credited.
        </p>
      </div>

      <FilterBar>
        <div className="w-48">
          <Select
            label="Type"
            options={[
              { value: '', label: 'All types' },
              { value: 'TOP_UP', label: 'TOP_UP' },
              { value: 'PAYIN_DEBIT', label: 'PAYIN_DEBIT' },
              { value: 'PAYIN_COMMISSION', label: 'PAYIN_COMMISSION' },
              { value: 'PAYOUT_CREDIT', label: 'PAYOUT_CREDIT' },
              { value: 'SETTLEMENT', label: 'SETTLEMENT' },
              { value: 'MANUAL_CREDIT', label: 'MANUAL_CREDIT' },
              { value: 'MANUAL_DEBIT', label: 'MANUAL_DEBIT' },
              { value: 'OVERDRAFT_SET', label: 'OVERDRAFT_SET' },
            ]}
            value={txType}
            onChange={(e) => {
              setTxType(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <FilterInput
          label="Currency"
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
          label="From"
          value={dateFrom}
          onChange={(v) => {
            setDateFrom(v);
            setPage(1);
          }}
          className="w-40"
        />
        <FilterInput
          type="date"
          label="To"
          value={dateTo}
          onChange={(v) => {
            setDateTo(v);
            setPage(1);
          }}
          className="w-40"
        />
      </FilterBar>

      <DataTable
        columns={columns}
        data={txList}
        isLoading={isLoading}
        emptyMessage="No transactions found"
      />

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-text-muted">
          <span>Total: {total}</span>
          <div className="flex gap-2">
            <button
              className="px-3 py-1 rounded bg-bg-secondary disabled:opacity-40"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
            >
              ← Previous
            </button>
            <span className="px-3 py-1">
              {page} / {totalPages}
            </span>
            <button
              className="px-3 py-1 rounded bg-bg-secondary disabled:opacity-40"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
