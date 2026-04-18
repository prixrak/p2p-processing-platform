'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Landmark } from 'lucide-react';
import { api } from '@/lib/api';
import { internalPaths } from '@/lib/internal-api';
import { SettlementCreateModal } from '@/features/settlements/settlement-create-modal';
import { DataTable } from '@/components/ui/data-table';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';

interface Settlement {
  id: string;
  type: 'CREDIT' | 'DEBIT';
  amount: number;
  currency: string;
  note: string | null;
  createdAt: string;
  admin: { email: string } | null;
  trader: { user: { email: string } } | null;
}

export default function SettlementsPage() {
  const [showForm, setShowForm] = useState(false);

  const { data: settlements = [], isLoading } = useQuery<Settlement[]>({
    queryKey: ['admin', 'settlements'],
    queryFn: async () => {
      const res = await api.get<{ data: Settlement[] }>(
        `${internalPaths.settlements}?page=1&limit=100`,
      );
      return res.data;
    },
  });

  const columns = [
    {
      key: 'id',
      header: 'ID',
      className: 'font-mono tabular-nums text-end',
      render: (row: Settlement) => (
        <span className="font-mono text-xs text-text-muted">{row.id.slice(0, 8)}</span>
      ),
    },
    {
      key: 'trader',
      header: 'Trader',
      render: (row: Settlement) => (
        <span className="text-text-primary">{row.trader?.user?.email ?? '—'}</span>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      className: 'text-center',
      render: (row: Settlement) => (
        <span className={row.type === 'CREDIT' ? 'text-accent-green' : 'text-accent-red'}>
          {row.type}
        </span>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      className: 'text-end tabular-nums font-mono',
      render: (row: Settlement) => (
        <span className="font-mono text-text-primary">
          {row.type === 'CREDIT' ? '+' : '-'}
          {row.amount.toLocaleString()} {row.currency}
        </span>
      ),
    },
    {
      key: 'note',
      header: 'Note',
      render: (row: Settlement) => (
        <span className="text-text-muted text-xs max-w-[200px] truncate block">
          {row.note || '—'}
        </span>
      ),
    },
    {
      key: 'createdAt',
      header: 'Date',
      render: (row: Settlement) => (
        <span className="text-xs text-text-muted">
          {format(new Date(row.createdAt), 'dd.MM.yy HH:mm')}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
            <Landmark size={24} />
            Settlements
          </h1>
          <p className="text-sm text-text-muted mt-1">
            Manage trader settlements and balance adjustments
          </p>
        </div>
        <Button onClick={() => setShowForm(true)}>New Settlement</Button>
      </div>

      <DataTable
        columns={columns}
        data={settlements}
        keyExtractor={(s) => s.id}
        isLoading={isLoading}
        emptyMessage="No settlements found"
      />

      <SettlementCreateModal
        open={showForm}
        onClose={() => setShowForm(false)}
        queryPrefix="admin"
      />
    </div>
  );
}
