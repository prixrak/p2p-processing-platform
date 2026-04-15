'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowDownCircle, ArrowUpCircle, RefreshCw, DollarSign } from 'lucide-react';
import { api } from '@/lib/api';
import { internalPaths } from '@/lib/internal-api';
import { Badge } from '@/components/ui/badge';
import { DataTable } from '@/components/ui/data-table';
import { Input } from '@/components/ui/input';

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
  PAYIN_COMMISSION: 'Pay-In комісія',
  PAYOUT_DEBIT: 'Pay-Out списання',
  SETTLEMENT: 'Розрахунок',
  MANUAL_CREDIT: 'Ручне поповнення',
  MANUAL_DEBIT: 'Ручне списання',
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
      header: 'Тип',
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
      header: 'Сума',
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
      header: 'Коментар / ID',
      render: (tx: BalanceTx) => (
        <span className="text-sm text-text-secondary">
          {tx.comment || (tx.referenceId ? <span className="font-mono text-xs">{tx.referenceId.slice(0, 8)}…</span> : '—')}
        </span>
      ),
    },
    {
      key: 'createdBy',
      header: 'Ким',
      render: (tx: BalanceTx) => (
        <span className="text-xs text-text-muted">{tx.createdBy?.email ?? 'система'}</span>
      ),
    },
    {
      key: 'createdAt',
      header: 'Час',
      render: (tx: BalanceTx) => (
        <span className="text-xs text-text-muted">
          {new Date(tx.createdAt).toLocaleString('uk-UA')}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
            <DollarSign className="h-6 w-6" /> Баланс — Рух коштів
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            Повна історія зарахувань та списань по вашому рахунку
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Input
          placeholder="Валюта (UAH)"
          value={currency}
          onChange={(e) => { setCurrency(e.target.value.toUpperCase()); setPage(1); }}
          className="w-32"
        />
        <Input
          type="date"
          label="Від"
          value={dateFrom}
          onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
          className="w-40"
        />
        <Input
          type="date"
          label="До"
          value={dateTo}
          onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
          className="w-40"
        />
      </div>

      <DataTable
        columns={columns}
        data={txList}
        isLoading={isLoading}
        emptyMessage="Операцій не знайдено"
      />

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-text-muted">
          <span>Всього: {total}</span>
          <div className="flex gap-2">
            <button
              className="px-3 py-1 rounded bg-bg-secondary disabled:opacity-40"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
            >
              ← Попередня
            </button>
            <span className="px-3 py-1">{page} / {totalPages}</span>
            <button
              className="px-3 py-1 rounded bg-bg-secondary disabled:opacity-40"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
            >
              Наступна →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
