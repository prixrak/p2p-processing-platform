'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Landmark } from 'lucide-react';
import { SettlementType } from '@p2p/shared';
import { api } from '@/lib/api';
import { internalPaths } from '@/lib/internal-api';
import { DataTable } from '@/components/ui/data-table';
import { StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { format } from 'date-fns';

interface Settlement {
  id: string;
  traderName: string;
  type: 'credit' | 'debit';
  amount: number;
  currency: string;
  status: string;
  note: string;
  createdAt: string;
}

interface TraderOption {
  id: string;
  name: string;
}

interface TraderBalance {
  currency: string;
  available: number;
  frozen: number;
}

export default function SettlementsPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);

  const [traderId, setTraderId] = useState('');
  const [type, setType] = useState<'credit' | 'debit'>('credit');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('RUB');
  const [note, setNote] = useState('');

  const { data: settlements = [], isLoading } = useQuery<Settlement[]>({
    queryKey: ['admin', 'settlements'],
    queryFn: async () => {
      const res = await api.get<{ data: Settlement[] }>(
        `${internalPaths.settlements}?page=1&limit=100`,
      );
      return res.data;
    },
  });

  const { data: traders = [] } = useQuery<TraderOption[]>({
    queryKey: ['admin', 'traders', 'options'],
    queryFn: async () => {
      const res = await api.get<{
        data: Array<{ id: string; user: { email: string } }>;
      }>(`${internalPaths.traders}?page=1&limit=500`);
      return res.data.map((t) => ({
        id: t.id,
        name: t.user.email,
      }));
    },
  });

  const { data: traderBalances } = useQuery<TraderBalance[]>({
    queryKey: ['admin', 'traders', traderId, 'balances'],
    queryFn: () => api.get(internalPaths.traderBalances(traderId)),
    enabled: !!traderId,
  });

  const createMutation = useMutation({
    mutationFn: () =>
      api.post(internalPaths.settlements, {
        traderId,
        type:
          type === 'credit' ? SettlementType.CREDIT : SettlementType.DEBIT,
        amount: parseFloat(amount),
        currency,
        note,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'settlements'] });
      resetForm();
    },
  });

  function resetForm() {
    setShowForm(false);
    setTraderId('');
    setType('credit');
    setAmount('');
    setCurrency('RUB');
    setNote('');
  }

  const columns = [
    {
      key: 'id',
      header: 'ID',
      render: (row) => (
        <span className="font-mono text-xs text-text-muted">{row.id.slice(0, 8)}</span>
      ),
    },
    {
      key: 'traderName',
      header: 'Trader',
      render: (row) => <span className="text-text-primary">{row.traderName}</span>,
    },
    {
      key: 'type',
      header: 'Type',
      render: (row) => (
        <span
          className={
            row.type === 'credit' ? 'text-accent-green' : 'text-accent-red'
          }
        >
          {row.type.toUpperCase()}
        </span>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      render: (row) => (
        <span className="font-mono text-text-primary">
          {row.type === 'credit' ? '+' : '-'}
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
      key: 'note',
      header: 'Note',
      render: (row) => (
        <span className="text-text-muted text-xs max-w-[200px] truncate block">
          {row.note || '—'}
        </span>
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

  const currentBalance = traderBalances?.find((b) => b.currency === currency);

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

      <Modal
        open={showForm}
        onClose={resetForm}
        title="New Settlement"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-text-muted mb-1">Trader</label>
            <select
              value={traderId}
              onChange={(e) => setTraderId(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-bg-input border border-border-primary rounded-lg text-text-primary focus:border-border-focus focus:outline-none"
            >
              <option value="">Select trader</option>
              {traders.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-text-muted mb-1">Type</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as 'credit' | 'debit')}
                className="w-full px-3 py-2 text-sm bg-bg-input border border-border-primary rounded-lg text-text-primary focus:border-border-focus focus:outline-none"
              >
                <option value="credit">Credit (Add funds)</option>
                <option value="debit">Debit (Withdraw funds)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-text-muted mb-1">Currency</label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-bg-input border border-border-primary rounded-lg text-text-primary focus:border-border-focus focus:outline-none"
              >
                <option value="RUB">RUB</option>
                <option value="USD">USD</option>
                <option value="USDT">USDT</option>
                <option value="EUR">EUR</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm text-text-muted mb-1">Amount</label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              min="0"
              step="0.01"
              className="w-full px-3 py-2 text-sm bg-bg-input border border-border-primary rounded-lg text-text-primary placeholder:text-text-muted focus:border-border-focus focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-sm text-text-muted mb-1">Note</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="Optional note..."
              className="w-full px-3 py-2 text-sm bg-bg-input border border-border-primary rounded-lg text-text-primary placeholder:text-text-muted focus:border-border-focus focus:outline-none resize-none"
            />
          </div>

          {traderId && currentBalance && (
            <div className="bg-bg-tertiary rounded-lg p-4 text-sm">
              <p className="text-text-muted mb-2">Balance Preview</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-text-muted text-xs">Current</p>
                  <p className="text-text-primary font-mono">
                    {currentBalance.available.toLocaleString()} {currency}
                  </p>
                </div>
                <div>
                  <p className="text-text-muted text-xs">After Settlement</p>
                  <p
                    className={`font-mono ${
                      type === 'credit'
                        ? 'text-accent-green'
                        : 'text-accent-red'
                    }`}
                  >
                    {(
                      currentBalance.available +
                      (type === 'credit' ? 1 : -1) * (parseFloat(amount) || 0)
                    ).toLocaleString()}{' '}
                    {currency}
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={resetForm}>
              Cancel
            </Button>
            <Button
              onClick={() => createMutation.mutate()}
              loading={createMutation.isPending}
              disabled={!traderId || !amount || parseFloat(amount) <= 0}
            >
              Create Settlement
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
