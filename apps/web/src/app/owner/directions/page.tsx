'use client';

import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Power, PowerOff, Pencil } from 'lucide-react';
import { DirectionType } from '@p2p/shared';
import { api } from '@/lib/api';
import { internalPaths } from '@/lib/internal-api';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Input } from '@/components/ui/input';
import { NumberInput } from '@/components/ui/number-input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import { DataTable } from '@/components/ui/data-table';

interface Direction {
  id: string;
  name: string;
  type: 'PAYIN' | 'PAYOUT';
  fromCurrency: string;
  toCurrency: string;
  rate: number;
  fee: number;
  minAmount: number;
  maxAmount: number;
  isOnline: boolean;
}

interface DirectionApiRow {
  id: string;
  name: string;
  type: DirectionType;
  fromCurrency: string;
  toCurrency: string;
  rate: unknown;
  percentFee: unknown;
  minAmount: unknown;
  maxAmount: unknown;
  isOnline: boolean;
}

interface DirectionsTableData {
  data: Direction[];
  totalPages: number;
}

function mapDirection(d: DirectionApiRow): Direction {
  return {
    id: d.id,
    name: d.name,
    type: d.type as 'PAYIN' | 'PAYOUT',
    fromCurrency: d.fromCurrency,
    toCurrency: d.toCurrency,
    rate: Number(d.rate),
    fee: Number(d.percentFee),
    minAmount: Number(d.minAmount),
    maxAmount: Number(d.maxAmount),
    isOnline: d.isOnline,
  };
}

const emptyForm: {
  name: string;
  type: 'PAYIN' | 'PAYOUT';
  fromCurrency: string;
  toCurrency: string;
  rate: number;
  fee: number;
  minAmount: number;
  maxAmount: number;
} = {
  name: '',
  type: 'PAYIN',
  fromCurrency: '',
  toCurrency: '',
  rate: 1,
  fee: 0,
  minAmount: 0,
  maxAmount: 0,
};

interface CurrencyRow {
  id: string;
  code: string;
  isActive: boolean;
}

export default function DirectionsPage() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [editItem, setEditItem] = useState<Direction | null>(null);
  const [form, setForm] = useState(emptyForm);

  const { data: currencies, isLoading: currenciesLoading } = useQuery({
    queryKey: ['owner', 'currencies'],
    queryFn: () => api.get<CurrencyRow[]>(internalPaths.currencies),
  });

  const currencySelectOptions = useMemo(() => {
    const rows = currencies ?? [];
    const active = rows.filter((c) => c.isActive);
    const opts = active.map((c) => ({ value: c.code, label: c.code }));
    const seen = new Set(opts.map((o) => o.value));
    if (editItem) {
      for (const code of [editItem.fromCurrency, editItem.toCurrency]) {
        if (code && !seen.has(code)) {
          opts.push({ value: code, label: `${code} (inactive)` });
          seen.add(code);
        }
      }
    }
    opts.sort((a, b) => a.value.localeCompare(b.value));
    return opts;
  }, [currencies, editItem]);

  const activeCurrencyCount = useMemo(
    () => (currencies ?? []).filter((c) => c.isActive).length,
    [currencies],
  );

  const { data, isLoading } = useQuery({
    queryKey: ['owner', 'directions'],
    queryFn: async () => {
      const rows = await api.get<DirectionApiRow[]>(internalPaths.directions);
      const mapped = rows.map(mapDirection);
      return {
        data: mapped,
        totalPages: 1,
      } satisfies DirectionsTableData;
    },
  });

  const createDirection = useMutation({
    mutationFn: (payload: typeof emptyForm) =>
      api.post(internalPaths.directions, {
        name: payload.name.trim(),
        type: payload.type,
        fromCurrency: payload.fromCurrency.trim().toUpperCase(),
        toCurrency: payload.toCurrency.trim().toUpperCase(),
        minAmount: payload.minAmount,
        maxAmount: payload.maxAmount,
        rate: payload.rate,
        percentFee: payload.fee,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['owner', 'directions'] });
      setShowCreate(false);
      setForm(emptyForm);
    },
  });

  const updateDirection = useMutation({
    mutationFn: (args: { id: string; form: typeof emptyForm }) =>
      api.put(internalPaths.direction(args.id), {
        name: args.form.name.trim(),
        fromCurrency: args.form.fromCurrency.trim().toUpperCase(),
        toCurrency: args.form.toCurrency.trim().toUpperCase(),
        minAmount: args.form.minAmount,
        maxAmount: args.form.maxAmount,
        rate: args.form.rate,
        percentFee: args.form.fee,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['owner', 'directions'] });
      setEditItem(null);
    },
  });

  const toggleOnline = useMutation({
    mutationFn: ({ id }: { id: string }) => api.patch(internalPaths.directionToggle(id)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['owner', 'directions'] }),
  });

  const openEdit = (d: Direction) => {
    setEditItem(d);
    setForm({
      name: d.name,
      type: d.type,
      fromCurrency: d.fromCurrency,
      toCurrency: d.toCurrency,
      rate: d.rate,
      fee: d.fee,
      minAmount: d.minAmount,
      maxAmount: d.maxAmount,
    });
  };

  const columns = [
    {
      key: 'name',
      header: 'Direction',
      render: (d: Direction) => (
        <div>
          <p className="font-medium text-text-primary">{d.name}</p>
          <p className="text-xs text-text-muted">
            {d.fromCurrency} → {d.toCurrency}
          </p>
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      render: (d: Direction) => (
        <Badge color={d.type === 'PAYIN' ? 'green' : 'blue'}>{d.type}</Badge>
      ),
    },
    {
      key: 'rate',
      header: 'Rate',
      render: (d: Direction) => (
        <span className="font-mono text-sm text-text-primary">{d.rate.toFixed(4)}</span>
      ),
    },
    {
      key: 'fee',
      header: 'Fee',
      render: (d: Direction) => (
        <span className="font-mono text-sm text-text-secondary">{d.fee}%</span>
      ),
    },
    {
      key: 'amounts',
      header: 'Min / Max',
      render: (d: Direction) => (
        <span className="text-sm text-text-secondary">
          {d.minAmount.toLocaleString()} — {d.maxAmount.toLocaleString()}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (d: Direction) => (
        <Badge color={d.isOnline ? 'green' : 'red'}>{d.isOnline ? 'Online' : 'Offline'}</Badge>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (d: Direction) => (
        <div className="flex items-center gap-2">
          <IconButton label="Edit direction" onClick={() => openEdit(d)}>
            <Pencil className="h-3.5 w-3.5" />
          </IconButton>
          <IconButton
            label={d.isOnline ? 'Take direction offline' : 'Put direction online'}
            variant={d.isOnline ? 'danger' : 'success'}
            onClick={() => toggleOnline.mutate({ id: d.id })}
          >
            {d.isOnline ? <PowerOff className="h-3.5 w-3.5" /> : <Power className="h-3.5 w-3.5" />}
          </IconButton>
        </div>
      ),
    },
  ];

  const formFields = (opts: { lockType: boolean }) => (
    <>
      <Input
        label="Name"
        value={form.name}
        onChange={(e) => setForm({ ...form, name: e.target.value })}
        placeholder="Card RUB → USDT"
        required
      />
      {opts.lockType ? (
        <div>
          <p className="text-sm font-medium text-text-secondary">Type</p>
          <Badge color={form.type === 'PAYIN' ? 'green' : 'blue'} className="mt-1">
            {form.type}
          </Badge>
          <p className="text-xs text-text-muted mt-1">
            Direction type cannot be changed; create a new direction if needed.
          </p>
        </div>
      ) : (
        <Select
          label="Type"
          options={[
            { value: 'PAYIN', label: 'Pay-In' },
            { value: 'PAYOUT', label: 'Pay-Out' },
          ]}
          value={form.type}
          onChange={(e) => setForm({ ...form, type: e.target.value as 'PAYIN' | 'PAYOUT' })}
        />
      )}
      <div className="grid grid-cols-2 gap-3">
        <Select
          label="From Currency"
          placeholder="Select currency"
          options={currencySelectOptions}
          value={form.fromCurrency}
          onChange={(e) => setForm({ ...form, fromCurrency: e.target.value })}
          required
          disabled={currenciesLoading}
        />
        <Select
          label="To Currency"
          placeholder="Select currency"
          options={currencySelectOptions}
          value={form.toCurrency}
          onChange={(e) => setForm({ ...form, toCurrency: e.target.value })}
          required
          disabled={currenciesLoading}
        />
      </div>
      {!currenciesLoading && activeCurrencyCount === 0 && (
        <p className="text-sm text-amber-600 dark:text-amber-400">
          No active currencies. Add and activate currencies under Currencies first.
        </p>
      )}
      <div className="grid grid-cols-2 gap-3">
        <NumberInput
          label="Rate"
          variant="rate"
          value={form.rate}
          onChange={(e) => setForm({ ...form, rate: parseFloat(e.target.value) || 0 })}
          required
        />
        <NumberInput
          label="Fee"
          variant="percent"
          suffix="%"
          value={form.fee}
          onChange={(e) => setForm({ ...form, fee: parseFloat(e.target.value) || 0 })}
          required
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <NumberInput
          label="Min Amount"
          variant="amount"
          value={form.minAmount}
          onChange={(e) => setForm({ ...form, minAmount: parseFloat(e.target.value) || 0 })}
        />
        <NumberInput
          label="Max Amount"
          variant="amount"
          value={form.maxAmount}
          onChange={(e) => setForm({ ...form, maxAmount: parseFloat(e.target.value) || 0 })}
        />
      </div>
    </>
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Directions</h1>
          <p className="mt-1 text-sm text-text-muted">
            Manage payment directions, rates and fees
          </p>
        </div>
        <Button
          onClick={() => {
            setForm(emptyForm);
            setShowCreate(true);
          }}
        >
          <Plus className="h-4 w-4" /> Create Direction
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        isLoading={isLoading}
        page={1}
        totalPages={data?.totalPages}
        emptyMessage="No directions configured"
      />

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create Direction">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            createDirection.mutate(form);
          }}
        >
          {formFields({ lockType: false })}
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" type="button" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              loading={createDirection.isPending}
              disabled={!currenciesLoading && activeCurrencyCount === 0}
            >
              Create
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={!!editItem}
        onClose={() => setEditItem(null)}
        title={`Edit — ${editItem?.name ?? ''}`}
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (editItem) updateDirection.mutate({ id: editItem.id, form });
          }}
        >
          {formFields({ lockType: true })}
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" type="button" onClick={() => setEditItem(null)}>
              Cancel
            </Button>
            <Button type="submit" loading={updateDirection.isPending}>
              Save Changes
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
