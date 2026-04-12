'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Power, PowerOff, Pencil } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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

interface DirectionsResponse {
  data: Direction[];
  total: number;
  page: number;
  totalPages: number;
}

const emptyForm = {
  name: '',
  type: 'PAYIN' as const,
  fromCurrency: '',
  toCurrency: '',
  rate: 1,
  fee: 0,
  minAmount: 0,
  maxAmount: 0,
};

export default function DirectionsPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [editItem, setEditItem] = useState<Direction | null>(null);
  const [form, setForm] = useState(emptyForm);

  const { data, isLoading } = useQuery({
    queryKey: ['owner', 'directions', page],
    queryFn: () => api.get<DirectionsResponse>(`/api/admin/directions?page=${page}&limit=20`),
  });

  const createDirection = useMutation({
    mutationFn: (payload: typeof form) => api.post('/api/admin/directions', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['owner', 'directions'] });
      setShowCreate(false);
      setForm(emptyForm);
    },
  });

  const updateDirection = useMutation({
    mutationFn: (payload: Partial<Direction> & { id: string }) =>
      api.patch(`/api/admin/directions/${payload.id}`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['owner', 'directions'] });
      setEditItem(null);
    },
  });

  const toggleOnline = useMutation({
    mutationFn: ({ id, isOnline }: { id: string; isOnline: boolean }) =>
      api.patch(`/api/admin/directions/${id}`, { isOnline: !isOnline }),
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
          <Button variant="ghost" size="sm" onClick={() => openEdit(d)} title="Edit">
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant={d.isOnline ? 'danger' : 'success'}
            size="sm"
            onClick={() => toggleOnline.mutate({ id: d.id, isOnline: d.isOnline })}
            title={d.isOnline ? 'Go Offline' : 'Go Online'}
          >
            {d.isOnline ? <PowerOff className="h-3.5 w-3.5" /> : <Power className="h-3.5 w-3.5" />}
          </Button>
        </div>
      ),
    },
  ];

  const formFields = (
    <>
      <Input
        label="Name"
        value={form.name}
        onChange={(e) => setForm({ ...form, name: e.target.value })}
        placeholder="Card RUB → USDT"
        required
      />
      <Select
        label="Type"
        options={[
          { value: 'PAYIN', label: 'Pay-In' },
          { value: 'PAYOUT', label: 'Pay-Out' },
        ]}
        value={form.type}
        onChange={(e) => setForm({ ...form, type: e.target.value as 'PAYIN' | 'PAYOUT' })}
      />
      <div className="grid grid-cols-2 gap-3">
        <Input
          label="From Currency"
          value={form.fromCurrency}
          onChange={(e) => setForm({ ...form, fromCurrency: e.target.value })}
          placeholder="RUB"
          required
        />
        <Input
          label="To Currency"
          value={form.toCurrency}
          onChange={(e) => setForm({ ...form, toCurrency: e.target.value })}
          placeholder="USDT"
          required
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Input
          label="Rate"
          type="number"
          step="0.0001"
          value={form.rate}
          onChange={(e) => setForm({ ...form, rate: parseFloat(e.target.value) || 0 })}
          required
        />
        <Input
          label="Fee (%)"
          type="number"
          step="0.01"
          value={form.fee}
          onChange={(e) => setForm({ ...form, fee: parseFloat(e.target.value) || 0 })}
          required
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Input
          label="Min Amount"
          type="number"
          value={form.minAmount}
          onChange={(e) => setForm({ ...form, minAmount: parseFloat(e.target.value) || 0 })}
        />
        <Input
          label="Max Amount"
          type="number"
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
        page={page}
        totalPages={data?.totalPages}
        onPageChange={setPage}
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
          {formFields}
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" type="button" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={createDirection.isPending}>
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
            if (editItem) updateDirection.mutate({ id: editItem.id, ...form });
          }}
        >
          {formFields}
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
