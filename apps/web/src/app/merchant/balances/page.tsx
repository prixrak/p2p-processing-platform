'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Wallet } from 'lucide-react';
import { api } from '@/lib/api';
import { internalPaths } from '@/lib/internal-api';
import { FilterBar, FilterInput } from '@/components/ui/filters';
import { DataTable } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';

interface BalanceRow {
  currency: string;
  available: number;
  frozen: number;
}

interface BalanceSummary {
  dateFrom: string | null;
  dateTo: string | null;
  payin_volume_fiat_paid: number;
  payout_volume_fiat_completed: number;
  payin_commission_fiat: number;
  payout_commission_fiat_on_completed: number;
  payout_commission_fiat_on_all_created_in_period: number;
}

interface MerchantBalanceTx {
  id: string;
  type: string;
  amount: string;
  currency: string;
  referenceId: string | null;
  comment: string | null;
  createdAt: string;
}

interface MerchantSettlementRow {
  id: string;
  amount: string | number;
  currency: string;
  manualRate: string | number | null;
  usdtEquivalent: string | number | null;
  usdtAddress: string | null;
  note: string | null;
  createdAt: string;
}

const TX_LABEL: Record<string, string> = {
  PAYIN_CREDIT: 'Pay-In credit',
  PAYOUT_DEBIT: 'Pay-Out debit',
  PAYOUT_REFUND: 'Pay-Out refund',
  MANUAL_CREDIT: 'Manual credit',
  MANUAL_DEBIT: 'Manual debit',
  TOP_UP: 'Top-up',
  SETTLEMENT: 'Withdrawal settlement',
};

export default function MerchantBalancesPage() {
  const [sumFrom, setSumFrom] = useState('');
  const [sumTo, setSumTo] = useState('');
  const [txFrom, setTxFrom] = useState('');
  const [txTo, setTxTo] = useState('');
  const [txType, setTxType] = useState('');
  const [txPage, setTxPage] = useState(1);

  const summaryQs =
    sumFrom || sumTo
      ? `${new URLSearchParams({
          ...(sumFrom ? { dateFrom: sumFrom } : {}),
          ...(sumTo ? { dateTo: sumTo } : {}),
        }).toString()}`
      : '';

  const { data: balances = [], isLoading: balancesLoading } = useQuery<BalanceRow[]>({
    queryKey: ['merchant', 'balances'],
    queryFn: () => api.get('/api/merchant/balances'),
  });

  const { data: summary, isLoading: sumLoading } = useQuery<BalanceSummary>({
    queryKey: ['merchant', 'balance-summary', sumFrom, sumTo],
    queryFn: () => api.get(internalPaths.merchantBalanceSummary(summaryQs)),
  });

  const txParams = new URLSearchParams({
    page: String(txPage),
    limit: '25',
  });
  if (txFrom) txParams.set('dateFrom', txFrom);
  if (txTo) txParams.set('dateTo', txTo);
  if (txType.trim()) txParams.set('type', txType.trim().toUpperCase());

  const { data: txData, isLoading: txLoading } = useQuery({
    queryKey: ['merchant', 'balance-transactions', txPage, txFrom, txTo, txType],
    queryFn: () =>
      api.get<{ data: MerchantBalanceTx[]; total: number; page: number; limit: number }>(
        internalPaths.merchantBalanceTransactions(txParams.toString()),
      ),
  });

  const { data: settlementResp, isLoading: settlementLoading } = useQuery({
    queryKey: ['merchant', 'settlements-history'],
    queryFn: () =>
      api.get<{ data: MerchantSettlementRow[]; total: number }>(
        internalPaths.merchantSettlements('page=1&limit=50'),
      ),
  });

  const txList = txData?.data ?? [];
  const txTotal = txData?.total ?? 0;
  const txLimit = txData?.limit ?? 25;
  const txTotalPages = Math.ceil(txTotal / txLimit);

  const settlementsList = settlementResp?.data ?? [];

  const settlementColumns = [
    {
      key: 'amount',
      header: 'Fiat debited',
      className: 'text-end font-mono text-sm',
      render: (r: MerchantSettlementRow) => (
        <span>
          {Number(r.amount).toLocaleString()} {r.currency}
        </span>
      ),
    },
    {
      key: 'rate',
      header: 'Manual rate',
      render: (r: MerchantSettlementRow) => (
        <span className="font-mono text-xs text-text-secondary">
          {r.manualRate != null ? Number(r.manualRate).toLocaleString() : '—'}
        </span>
      ),
    },
    {
      key: 'usdt',
      header: 'USDT sent',
      className: 'text-end font-mono text-xs',
      render: (r: MerchantSettlementRow) => (
        <span>
          {r.usdtEquivalent != null ? Number(r.usdtEquivalent).toLocaleString() : '—'} USDT
        </span>
      ),
    },
    {
      key: 'address',
      header: 'Recorded address',
      render: (r: MerchantSettlementRow) => (
        <span className="font-mono text-[10px] break-all text-text-muted max-w-[200px] inline-block">
          {r.usdtAddress ?? '—'}
        </span>
      ),
    },
    {
      key: 'createdAt',
      header: 'Recorded at',
      render: (r: MerchantSettlementRow) => (
        <span className="text-xs text-text-muted">
          {new Date(r.createdAt).toLocaleString('en-US')}
        </span>
      ),
    },
  ];

  const txColumns = [
    {
      key: 'type',
      header: 'Type',
      render: (r: MerchantBalanceTx) => (
        <Badge color="blue">{TX_LABEL[r.type] ?? r.type}</Badge>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      className: 'text-end font-mono text-sm',
      render: (r: MerchantBalanceTx) => (
        <span>
          {Number(r.amount).toLocaleString()} {r.currency}
        </span>
      ),
    },
    {
      key: 'comment',
      header: 'Comment / ref',
      render: (r: MerchantBalanceTx) => (
        <span className="text-xs text-text-secondary truncate max-w-[200px] block">
          {r.comment || r.referenceId?.slice(0, 8) || '—'}
        </span>
      ),
    },
    {
      key: 'createdAt',
      header: 'Time',
      render: (r: MerchantBalanceTx) => (
        <span className="text-xs text-text-muted">
          {new Date(r.createdAt).toLocaleString('en-US')}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
          <Wallet size={24} />
          Balances
        </h1>
        <p className="text-sm text-text-muted mt-1">
          Fiat balances by currency code; period totals sum amounts in each order currency without FX conversion.
          Settlements, commissions shown below use the same nominal fiat units. Full ledger history follows.
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
                  <span
                    className={
                      frozen > 0 ? 'text-accent-yellow font-mono' : 'font-mono text-text-secondary'
                    }
                  >
                    {frozen.toLocaleString()}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

      <section className="rounded-xl border border-border-subtle bg-bg-secondary p-4 space-y-3">
        <h2 className="text-sm font-semibold text-text-primary">Period summary</h2>
        <FilterBar>
          <FilterInput
            type="date"
            label="From"
            value={sumFrom}
            onChange={setSumFrom}
            className="w-40"
          />
          <FilterInput type="date" label="To" value={sumTo} onChange={setSumTo} className="w-40" />
        </FilterBar>
        {sumLoading || !summary ? (
          <p className="text-sm text-text-muted">Loading…</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 text-sm">
            <div>
              <p className="text-text-muted text-xs">Pay-In volume (PAID)</p>
              <p className="font-mono">{summary.payin_volume_fiat_paid.toLocaleString()} (fiat units)</p>
            </div>
            <div>
              <p className="text-text-muted text-xs">Pay-Out volume (COMPLETED)</p>
              <p className="font-mono">{summary.payout_volume_fiat_completed.toLocaleString()} (fiat units)</p>
            </div>
            <div>
              <p className="text-text-muted text-xs">Pay-In commission (platform)</p>
              <p className="font-mono">{summary.payin_commission_fiat.toLocaleString()} (fiat units)</p>
            </div>
            <div>
              <p className="text-text-muted text-xs">Pay-Out commission (completed)</p>
              <p className="font-mono">
                {summary.payout_commission_fiat_on_completed.toLocaleString()} (fiat units)
              </p>
            </div>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-border-subtle bg-bg-secondary p-4 space-y-3">
        <h2 className="text-sm font-semibold text-text-primary">Withdrawal settlements</h2>
        <p className="text-xs text-text-muted leading-relaxed">
          Fiat rows booked when operators confirm payouts (manual FX + USDT). Requests use your support
          channel outside this cabinet.
        </p>
        <DataTable
          columns={settlementColumns}
          data={settlementsList}
          isLoading={settlementLoading}
          emptyMessage="No settlements booked yet"
        />
      </section>

      <section className="rounded-xl border border-border-subtle bg-bg-secondary p-4 space-y-3">
        <h2 className="text-sm font-semibold text-text-primary">Balance transactions</h2>
        <FilterBar>
          <FilterInput
            type="date"
            label="From"
            value={txFrom}
            onChange={(v) => {
              setTxFrom(v);
              setTxPage(1);
            }}
            className="w-40"
          />
          <FilterInput
            type="date"
            label="To"
            value={txTo}
            onChange={(v) => {
              setTxTo(v);
              setTxPage(1);
            }}
            className="w-40"
          />
          <FilterInput
            label="Type"
            value={txType}
            onChange={(v) => {
              setTxType(v);
              setTxPage(1);
            }}
            placeholder="PAYIN_CREDIT"
            className="w-40"
          />
        </FilterBar>
        <DataTable
          columns={txColumns}
          data={txList}
          isLoading={txLoading}
          emptyMessage="No transactions"
        />
        {txTotalPages > 1 && (
          <div className="flex justify-between text-xs text-text-muted">
            <span>Total: {txTotal}</span>
            <div className="flex gap-2">
              <button
                type="button"
                className="px-2 py-1 rounded bg-bg-primary disabled:opacity-40"
                disabled={txPage <= 1}
                onClick={() => setTxPage((p) => Math.max(1, p - 1))}
              >
                Prev
              </button>
              <span>
                {txPage} / {txTotalPages}
              </span>
              <button
                type="button"
                className="px-2 py-1 rounded bg-bg-primary disabled:opacity-40"
                disabled={txPage >= txTotalPages}
                onClick={() => setTxPage((p) => Math.min(txTotalPages, p + 1))}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
