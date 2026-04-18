'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SettlementType } from '@p2p/shared';
import { api } from '@/lib/api';
import { internalPaths } from '@/lib/internal-api';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { NumberInput } from '@/components/ui/number-input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { StaffRolePrefix } from '@/features/traders/query-keys';
import { staffTraderKeys } from '@/features/traders/query-keys';

interface TraderOption {
  id: string;
  name: string;
}

interface TraderBalance {
  currency: string;
  available: number;
  frozen: number;
}

export function SettlementCreateModal({
  open,
  onClose,
  queryPrefix,
}: {
  open: boolean;
  onClose: () => void;
  queryPrefix: StaffRolePrefix;
}) {
  const queryClient = useQueryClient();
  const [traderId, setTraderId] = useState('');
  const [type, setType] = useState<'credit' | 'debit'>('credit');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('UAH');
  const [note, setNote] = useState('');

  const { data: traders = [] } = useQuery<TraderOption[]>({
    queryKey: staffTraderKeys.traderOptions(queryPrefix),
    queryFn: async () => {
      const res = await api.get<{
        data: Array<{ id: string; user: { email: string } }>;
      }>(`${internalPaths.traders}?page=1&limit=500`);
      return res.data.map((t) => ({
        id: t.id,
        name: t.user.email,
      }));
    },
    enabled: open,
  });

  const { data: traderBalances } = useQuery<TraderBalance[]>({
    queryKey: [queryPrefix, 'traders', traderId, 'balances'],
    queryFn: () => api.get(internalPaths.traderBalances(traderId)),
    enabled: open && !!traderId,
  });

  const { data: currencyOptions = [] } = useQuery<{ code: string }[]>({
    queryKey: ['currencies'],
    queryFn: async () => {
      const res = await api.get<{ data: { code: string }[] } | { code: string }[]>(internalPaths.currencies);
      return Array.isArray(res) ? res : res.data;
    },
    enabled: open,
  });

  const createMutation = useMutation({
    mutationFn: () =>
      api.post(internalPaths.settlements, {
        traderId,
        type: type === 'credit' ? SettlementType.CREDIT : SettlementType.DEBIT,
        amount: parseFloat(amount),
        currency,
        note,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [queryPrefix, 'settlements'] });
      resetForm();
    },
  });

  function resetForm() {
    setTraderId('');
    setType('credit');
    setAmount('');
    setCurrency('UAH');
    setNote('');
    onClose();
  }

  const currentBalance = traderBalances?.find((b) => b.currency === currency);

  return (
    <Modal open={open} onClose={resetForm} title="New Settlement">
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
                    type === 'credit' ? 'text-accent-green' : 'text-accent-red'
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
  );
}
