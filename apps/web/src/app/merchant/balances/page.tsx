'use client';

import { useQuery } from '@tanstack/react-query';
import { Wallet, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { api } from '@/lib/api';
import { DataTable } from '@/components/ui/data-table';
import { StatusBadge } from '@/components/ui/badge';
import { format } from 'date-fns';

interface Balance {
  currency: string;
  available: number;
  frozen: number;
  total: number;
}

interface Transaction {
  id: string;
  type: string;
  direction: 'in' | 'out';
  amount: number;
  currency: string;
  status: string;
  description: string;
  createdAt: string;
}

export default function MerchantBalancesPage() {
  const { data: balances = [], isLoading: balancesLoading } = useQuery<Balance[]>({
    queryKey: ['merchant', 'balances'],
    queryFn: () => api.get('/api/merchant/balances'),
  });

  const { data: transactions = [], isLoading: txLoading } = useQuery<Transaction[]>({
    queryKey: ['merchant', 'transactions'],
    queryFn: () => api.get('/api/merchant/transactions'),
  });

  const columns = [
    {
      key: 'direction',
      header: '',
      render: (row) =>
        row.direction === 'in' ? (
          <ArrowDownLeft size={16} className="text-accent-green" />
        ) : (
          <ArrowUpRight size={16} className="text-accent-red" />
        ),
      className: 'w-8',
    },
    {
      key: 'type',
      header: 'Type',
      render: (row) => (
        <span className="text-text-primary text-sm capitalize">{row.type.replace(/_/g, ' ')}</span>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      render: (row) => (
        <span
          className={`font-mono text-sm ${
            row.direction === 'in' ? 'text-accent-green' : 'text-accent-red'
          }`}
        >
          {row.direction === 'in' ? '+' : '-'}
          {row.amount.toLocaleString()} {row.currency}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: 'description',
      header: 'Description',
      render: (row) => (
        <span className="text-text-muted text-xs">{row.description || '—'}</span>
      ),
    },
    {
      key: 'createdAt',
      header: 'Date',
      render: (row) => (
        <span className="text-xs text-text-muted">
          {format(new Date(row.createdAt), 'dd.MM.yy HH:mm')}
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
          Account balances and transaction history
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
              <div className="h-3 w-20 bg-bg-tertiary rounded" />
            </div>
          ))
        ) : (
          balances.map((b) => (
            <div
              key={b.currency}
              className="bg-bg-card border border-border-primary rounded-xl p-5"
            >
              <p className="text-sm text-text-muted mb-1">{b.currency}</p>
              <p className="text-2xl font-bold text-text-primary font-mono">
                {b.available.toLocaleString()}
              </p>
              <div className="flex gap-4 mt-2 text-xs">
                <span className="text-text-muted">
                  Total: <span className="text-text-secondary font-mono">{b.total.toLocaleString()}</span>
                </span>
                {b.frozen > 0 && (
                  <span className="text-accent-yellow">
                    Frozen: {b.frozen.toLocaleString()}
                  </span>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <div>
        <h2 className="text-lg font-semibold text-text-primary mb-4">
          Transaction History
        </h2>
        <DataTable
          columns={columns}
          data={transactions}
          keyExtractor={(t) => t.id}
          isLoading={txLoading}
          emptyMessage="No transactions yet"
        />
      </div>
    </div>
  );
}
