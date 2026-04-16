'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowDownCircle, ArrowUpCircle, DollarSign } from 'lucide-react';
import { api } from '@/lib/api';
import { internalPaths } from '@/lib/internal-api';
import { Badge } from '@/components/ui/badge';
import { DataTable } from '@/components/ui/data-table';
import { FilterBar, FilterInput } from '@/components/ui/filters';

interface BalanceTx {
  id: string;
  type: string;
  amount: string;
  currency: string;
  referenceId: string | null;
  comment: string | null;
  createdAt: string;
  createdBy: { email: string } | null;
}

const TX_TYPE_LABELS: Record<string, string> = {
  PAYIN_COMMISSION: 'Pay-In commission',
  PAYOUT_DEBIT: 'Pay-Out debit',
  SETTLEMENT: 'Settlement',
  MANUAL_CREDIT: 'Manual credit',
  MANUAL_DEBIT: 'Manual debit',
};

const TX_TYPE_COLOR: Record<string, 'green' | 'red' | 'blue' | 'yellow'> = {
  PAYIN_COMMISSION: 'green',
  SETTLEMENT: 'blue',
  MANUAL_CREDIT: 'green',
  PAYOUT_DEBIT: 'red',
  MANUAL_DEBIT: 'red',
};

const isCredit = (type: string) =>
  ['PAYIN_COMMISSION', 'MANUAL_CREDIT', 'SETTLEMENT'].includes(type);

export default function BalanceHistoryPage() {
  const [currency, setCurrency] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['trader', 'balance-transactions', page, currency, dateFrom, dateTo],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), limit: '30' });
      if (currency) params.set('currency', currency);
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);
      return api.get<{ data: BalanceTx[]; total: number; page: number; limit: number }>(
        `${internalPaths.balanceTransactions}?${params}`,
      );
    },
  });

  const txList = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / 30);

  const columns = [
    {
      key: 'type',
      header: 'Type',
      render: (tx: BalanceTx) => (
        <div className="flex items-center gap-2">
          {isCredit(tx.type) ? (
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
      key: 'amount',
      header: 'Amount',
      className: 'text-end tabular-nums',
      render: (tx: BalanceTx) => (
        <span
          className={`font-mono font-semibold ${isCredit(tx.type) ? 'text-green-400' : 'text-red-400'}`}
        >
          {isCredit(tx.type) ? '+' : '−'}
          {Number(tx.amount).toLocaleString()} {tx.currency}
        </span>
      ),
    },
    {
      key: 'comment',
      header: 'Comment / ID',
      render: (tx: BalanceTx) => (
        <span className="text-sm text-text-secondary">
          {tx.comment || (tx.referenceId ? <span className="font-mono text-xs">{tx.referenceId.slice(0, 8)}…</span> : '—')}
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
            <DollarSign className="h-6 w-6" /> Balance — Ledger
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            Full history of credits and debits on your account
          </p>
        </div>
      </div>

      <FilterBar>
        <FilterInput
          label="Currency"
          value={currency}
          onChange={(v) => { setCurrency(v.toUpperCase()); setPage(1); }}
          placeholder="UAH"
          className="w-32"
        />
        <FilterInput
          type="date"
          label="From"
          value={dateFrom}
          onChange={(v) => { setDateFrom(v); setPage(1); }}
          className="w-40"
        />
        <FilterInput
          type="date"
          label="To"
          value={dateTo}
          onChange={(v) => { setDateTo(v); setPage(1); }}
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
            <span className="px-3 py-1">{page} / {totalPages}</span>
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
