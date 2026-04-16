'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CreditCard,
  Plus,
  RefreshCw,
  Power,
  PowerOff,
  Pencil,
  Building,
  Hash,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Modal } from '@/components/ui/modal';
import { Input } from '@/components/ui/input';
import { NumberInput } from '@/components/ui/number-input';
import { Select } from '@/components/ui/select';
import { ProgressBar } from '@/components/ui/progress-bar';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { RequisiteType } from '@p2p/shared';

/** Normalized row for UI (snake_case) */
interface Requisite {
  id: string;
  type: RequisiteType;
  number: string;
  owner: string;
  bank_name: string;
  is_active: boolean;
  accepts_other_banks: boolean;
  min_amount: number;
  max_amount: number;
  limit_amount: number;
  used_amount: number;
  limit_operations: number;
  used_operations: number;
}

interface RequisiteApiRow {
  id: string;
  type: RequisiteType;
  number: string;
  owner: string;
  isActive: boolean;
  acceptsOtherBanks: boolean;
  minAmount: unknown;
  maxAmount: unknown;
  limitTotalAmount: unknown;
  limitTotalOps: number;
  usedAmount: unknown;
  usedOps: number;
  bank: { id: number; name: string } | null;
}

interface BankOption {
  id: number;
  name: string;
}

function num(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return Number(v);
  return Number(v);
}

function mapRequisite(r: RequisiteApiRow): Requisite {
  return {
    id: r.id,
    type: r.type,
    number: r.number,
    owner: r.owner,
    bank_name: r.bank?.name ?? '—',
    is_active: r.isActive,
    accepts_other_banks: r.acceptsOtherBanks,
    min_amount: num(r.minAmount),
    max_amount: num(r.maxAmount),
    limit_amount: num(r.limitTotalAmount),
    used_amount: num(r.usedAmount),
    limit_operations: r.limitTotalOps,
    used_operations: r.usedOps,
  };
}

interface RequisiteFormData {
  type: RequisiteType;
  number: string;
  owner: string;
  bank_id: string;
  accepts_other_banks: boolean;
  min_amount: number;
  max_amount: number;
  limit_amount: number;
  limit_operations: number;
}

const defaultForm: RequisiteFormData = {
  type: RequisiteType.CARD,
  number: '',
  owner: '',
  bank_id: '',
  accepts_other_banks: false,
  min_amount: 100,
  max_amount: 50000,
  limit_amount: 500000,
  limit_operations: 100,
};

export default function RequisitesPage() {
  const queryClient = useQueryClient();
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingRequisite, setEditingRequisite] = useState<Requisite | null>(null);
  const [form, setForm] = useState<RequisiteFormData>(defaultForm);

  const { data: banks = [] } = useQuery({
    queryKey: ['banks', 'list'],
    queryFn: () => api.get<BankOption[]>('/api/banks'),
  });

  const { data: requisites, isLoading, refetch } = useQuery({
    queryKey: ['trader', 'requisites'],
    queryFn: async () => {
      const rows = await api.get<RequisiteApiRow[]>('/api/requisites/my?includeInactive=true');
      return rows.map(mapRequisite);
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: RequisiteFormData) => {
      const bankId = data.bank_id ? Number(data.bank_id) : undefined;
      return api.post('/api/requisites/my', {
        type: data.type,
        number: data.number,
        owner: data.owner,
        ...(bankId ? { bankId } : {}),
        minAmount: data.min_amount,
        maxAmount: data.max_amount,
        limitTotalAmount: data.limit_amount,
        limitTotalOps: data.limit_operations,
        acceptsOtherBanks: data.accepts_other_banks,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trader', 'requisites'] });
      setShowAddModal(false);
      setForm(defaultForm);
    },
  });

  const updateLimitsMutation = useMutation({
    mutationFn: ({
      id,
      limits,
      acceptsOtherBanks,
    }: {
      id: string;
      limits: Pick<
        RequisiteFormData,
        'min_amount' | 'max_amount' | 'limit_amount' | 'limit_operations'
      >;
      acceptsOtherBanks: boolean;
    }) =>
      api.put(`/api/requisites/${id}`, {
        minAmount: limits.min_amount,
        maxAmount: limits.max_amount,
        limitTotalAmount: limits.limit_amount,
        limitTotalOps: limits.limit_operations,
        acceptsOtherBanks,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trader', 'requisites'] });
      setEditingRequisite(null);
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, makeActive }: { id: string; makeActive: boolean }) => {
      if (makeActive) {
        return api.patch(`/api/requisites/${id}/activate`);
      }
      return api.patch(`/api/requisites/${id}/deactivate`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trader', 'requisites'] });
    },
  });

  function handleSubmitCreate(e: React.FormEvent) {
    e.preventDefault();
    createMutation.mutate(form);
  }

  function handleSubmitEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingRequisite) return;
    updateLimitsMutation.mutate({
      id: editingRequisite.id,
      limits: {
        min_amount: form.min_amount,
        max_amount: form.max_amount,
        limit_amount: form.limit_amount,
        limit_operations: form.limit_operations,
      },
      acceptsOtherBanks: form.accepts_other_banks,
    });
  }

  function openEditModal(req: Requisite) {
    setEditingRequisite(req);
    setForm({
      type: req.type,
      number: req.number,
      owner: req.owner,
      bank_id: '',
      accepts_other_banks: req.accepts_other_banks,
      min_amount: req.min_amount,
      max_amount: req.max_amount,
      limit_amount: req.limit_amount,
      limit_operations: req.limit_operations,
    });
  }

  const bankOptions = banks.map((b) => ({ value: String(b.id), label: b.name }));

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <CreditCard className="h-6 w-6 text-accent-blue" />
          <div>
            <h1 className="text-2xl font-bold text-text-primary">Requisites</h1>
            <p className="text-sm text-text-muted">Manage your payment requisites and limits</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="secondary" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button
            onClick={() => {
              setForm(defaultForm);
              setShowAddModal(true);
            }}
          >
            <Plus className="h-4 w-4" />
            Add Requisite
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent-blue border-t-transparent" />
        </div>
      ) : !requisites || requisites.length === 0 ? (
        <Card className="text-center py-12">
          <CreditCard className="mx-auto h-10 w-10 text-text-muted mb-3" />
          <p className="text-text-muted">No requisites yet. Add your first one.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {requisites.map((req) => (
            <Card key={req.id}>
              <div className="flex flex-col gap-4">
                <div className="flex gap-3">
                  <div
                    className={cn(
                      'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
                      req.is_active ? 'bg-accent-green/10' : 'bg-bg-hover',
                    )}
                  >
                    {req.type === RequisiteType.CARD ? (
                      <CreditCard
                        className={cn('h-5 w-5', req.is_active ? 'text-accent-green' : 'text-text-muted')}
                      />
                    ) : (
                      <Building
                        className={cn('h-5 w-5', req.is_active ? 'text-accent-green' : 'text-text-muted')}
                      />
                    )}
                  </div>
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="break-all font-mono text-sm font-medium text-text-primary">
                        {req.number}
                      </span>
                      <Badge variant={req.is_active ? 'success' : 'muted'} dot className="shrink-0">
                        {req.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                    <div className="flex flex-col gap-1 text-xs text-text-muted sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-2">
                      <span className="break-words">{req.owner}</span>
                      <span className="hidden text-text-muted/60 sm:inline" aria-hidden>
                        ·
                      </span>
                      <span className="break-words">{req.bank_name}</span>
                      <span className="flex flex-wrap items-center gap-2">
                        <Badge variant="default" className="shrink-0">
                          {req.type}
                        </Badge>
                        {req.accepts_other_banks && (
                          <Badge variant="info" className="shrink-0 text-[10px]">
                            Other banks
                          </Badge>
                        )}
                      </span>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-start">
                    <Button size="sm" variant="ghost" onClick={() => openEditModal(req)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant={req.is_active ? 'danger' : 'success'}
                      onClick={() =>
                        toggleMutation.mutate({ id: req.id, makeActive: !req.is_active })
                      }
                      loading={toggleMutation.isPending}
                    >
                      {req.is_active ? <PowerOff className="h-3.5 w-3.5" /> : <Power className="h-3.5 w-3.5" />}
                      {req.is_active ? 'Disable' : 'Enable'}
                    </Button>
                  </div>
                </div>

                <div className="space-y-3 border-t border-border-primary pt-1">
                  <ProgressBar label="Volume Used" value={req.used_amount} max={req.limit_amount} />
                  <ProgressBar
                    label="Operations Used"
                    value={req.used_operations}
                    max={req.limit_operations}
                  />
                </div>

                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-0.5 rounded-lg bg-bg-secondary px-3 py-2.5 text-xs">
                  <span className="text-text-muted">Amount range</span>
                  <span className="text-end tabular-nums font-medium text-text-secondary">
                    {req.min_amount.toLocaleString()} – {req.max_amount.toLocaleString()}
                  </span>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Add New Requisite"
        size="md"
      >
        <form onSubmit={handleSubmitCreate} className="space-y-4">
          <Select
            label="Type"
            options={[
              { value: RequisiteType.CARD, label: 'Card' },
              { value: RequisiteType.IBAN, label: 'IBAN' },
            ]}
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value as RequisiteType })}
          />
          <Input
            label={form.type === RequisiteType.CARD ? 'Card Number' : 'IBAN'}
            placeholder={form.type === RequisiteType.CARD ? '0000 0000 0000 0000' : 'UA000000000000000000000000000'}
            value={form.number}
            onChange={(e) => setForm({ ...form, number: e.target.value })}
            required
          />
          <Input
            label="Owner Name"
            placeholder="Full name of card/account owner"
            value={form.owner}
            onChange={(e) => setForm({ ...form, owner: e.target.value })}
            required
          />
          <Select
            label="Bank (optional)"
            options={[{ value: '', label: '—' }, ...bankOptions]}
            value={form.bank_id}
            onChange={(e) => setForm({ ...form, bank_id: e.target.value })}
          />
          <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
            <input
              type="checkbox"
              className="rounded border-border-primary"
              checked={form.accepts_other_banks}
              onChange={(e) => setForm({ ...form, accepts_other_banks: e.target.checked })}
            />
            Accept transfers from other banks
          </label>
          <div className="grid grid-cols-2 gap-4">
            <NumberInput
              label="Min Amount"
              variant="amount"
              value={form.min_amount}
              onChange={(e) => setForm({ ...form, min_amount: Number(e.target.value) })}
            />
            <NumberInput
              label="Max Amount"
              variant="amount"
              value={form.max_amount}
              onChange={(e) => setForm({ ...form, max_amount: Number(e.target.value) })}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <NumberInput
              label="Volume Limit"
              variant="amount"
              value={form.limit_amount}
              onChange={(e) => setForm({ ...form, limit_amount: Number(e.target.value) })}
            />
            <NumberInput
              label="Operations Limit"
              variant="integer"
              value={form.limit_operations}
              onChange={(e) => setForm({ ...form, limit_operations: Number(e.target.value) })}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" type="button" onClick={() => setShowAddModal(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={createMutation.isPending}>
              <Plus className="h-4 w-4" />
              Create Requisite
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={!!editingRequisite}
        onClose={() => setEditingRequisite(null)}
        title="Edit Requisite Limits"
        size="md"
      >
        {editingRequisite && (
          <form onSubmit={handleSubmitEdit} className="space-y-4">
            <div className="rounded-lg bg-bg-secondary p-3">
              <div className="flex items-center gap-2 text-sm">
                <Hash className="h-4 w-4 text-text-muted" />
                <span className="font-mono text-text-secondary">{editingRequisite.number}</span>
                <span className="text-text-muted">&middot;</span>
                <span className="text-text-muted">{editingRequisite.bank_name}</span>
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
              <input
                type="checkbox"
                className="rounded border-border-primary"
                checked={form.accepts_other_banks}
                onChange={(e) => setForm({ ...form, accepts_other_banks: e.target.checked })}
              />
              Accept transfers from other banks
            </label>
            <div className="grid grid-cols-2 gap-4">
              <NumberInput
                label="Min Amount"
                variant="amount"
                value={form.min_amount}
                onChange={(e) => setForm({ ...form, min_amount: Number(e.target.value) })}
              />
              <NumberInput
                label="Max Amount"
                variant="amount"
                value={form.max_amount}
                onChange={(e) => setForm({ ...form, max_amount: Number(e.target.value) })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <NumberInput
                label="Volume Limit"
                variant="amount"
                value={form.limit_amount}
                onChange={(e) => setForm({ ...form, limit_amount: Number(e.target.value) })}
              />
              <NumberInput
                label="Operations Limit"
                variant="integer"
                value={form.limit_operations}
                onChange={(e) => setForm({ ...form, limit_operations: Number(e.target.value) })}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" type="button" onClick={() => setEditingRequisite(null)}>
                Cancel
              </Button>
              <Button type="submit" loading={updateLimitsMutation.isPending}>
                Save Changes
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
