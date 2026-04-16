'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Landmark } from 'lucide-react';
import { SettlementType } from '@p2p/shared';
import { api } from '@/lib/api';
import { internalPaths } from '@/lib/internal-api';
import { DataTable } from '@/components/ui/data-table';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { NumberInput } from '@/components/ui/number-input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
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
  const [currency, setCurrency] = useState('UAH');
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

  const { data: currencyOptions = [] } = useQuery<{ code: string }[]>({
    queryKey: ['currencies'],
    queryFn: async () => {
      const res = await api.get<{ data: { code: string }[] } | { code: string }[]>(internalPaths.currencies);
      return Array.isArray(res) ? res : res.data;
    },
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
      render: (row: Settlement) => (
        <span className={row.type === 'CREDIT' ? 'text-accent-green' : 'text-accent-red'}>
          {row.type}
        </span>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
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
          <Select
            label="Trader"
            placeholder="Select trader"
            options={[
              { value: '', label: 'Select trader' },
              ...traders.map((t) => ({ value: t.id, label: t.name })),
            ]}
            value={traderId}
            onChange={(e) => setTraderId(e.target.value)}
          />

          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Type"
              options={[
                { value: 'credit', label: 'Credit (Add funds)' },
                { value: 'debit', label: 'Debit (Withdraw funds)' },
              ]}
              value={type}
              onChange={(e) => setType(e.target.value as 'credit' | 'debit')}
            />
            <Select
              label="Currency"
              options={
                currencyOptions.length > 0
                  ? currencyOptions.map((c) => ({ value: c.code, label: c.code }))
                  : [{ value: 'UAH', label: 'UAH' }]
              }
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
            />
          </div>

          <NumberInput
            label="Amount"
            variant="amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            min={0}
          />

          <Textarea
            label="Note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="Optional note…"
          />

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
