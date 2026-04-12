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
import { Select } from '@/components/ui/select';
import { ProgressBar } from '@/components/ui/progress-bar';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { RequisiteType } from '@p2p/shared';

interface Requisite {
  id: string;
  type: RequisiteType;
  number: string;
  owner: string;
  bank_name: string;
  is_active: boolean;
  min_amount: number;
  max_amount: number;
  limit_amount: number;
  used_amount: number;
  limit_operations: number;
  used_operations: number;
  created_at: number;
}

interface RequisiteFormData {
  type: RequisiteType;
  number: string;
  owner: string;
  bank_name: string;
  min_amount: number;
  max_amount: number;
  limit_amount: number;
  limit_operations: number;
}

const defaultForm: RequisiteFormData = {
  type: RequisiteType.CARD,
  number: '',
  owner: '',
  bank_name: '',
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

  const { data: requisites, isLoading, refetch } = useQuery({
    queryKey: ['trader', 'requisites'],
    queryFn: () => api.get<Requisite[]>('/api/trader/requisites'),
  });

  const createMutation = useMutation({
    mutationFn: (data: RequisiteFormData) => api.post('/api/trader/requisites', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trader', 'requisites'] });
      setShowAddModal(false);
      setForm(defaultForm);
    },
  });

  const updateLimitsMutation = useMutation({
    mutationFn: ({ id, limits }: { id: string; limits: Partial<RequisiteFormData> }) =>
      api.patch(`/api/trader/requisites/${id}/limits`, limits),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trader', 'requisites'] });
      setEditingRequisite(null);
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      api.patch(`/api/trader/requisites/${id}/toggle`, { is_active: active }),
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
    });
  }

  function openEditModal(req: Requisite) {
    setEditingRequisite(req);
    setForm({
      type: req.type,
      number: req.number,
      owner: req.owner,
      bank_name: req.bank_name,
      min_amount: req.min_amount,
      max_amount: req.max_amount,
      limit_amount: req.limit_amount,
      limit_operations: req.limit_operations,
    });
  }

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
            <Card key={req.id} className="space-y-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      'flex h-10 w-10 items-center justify-center rounded-lg',
                      req.is_active ? 'bg-accent-green/10' : 'bg-bg-hover',
                    )}
                  >
                    {req.type === RequisiteType.CARD ? (
                      <CreditCard className={cn('h-5 w-5', req.is_active ? 'text-accent-green' : 'text-text-muted')} />
                    ) : (
                      <Building className={cn('h-5 w-5', req.is_active ? 'text-accent-green' : 'text-text-muted')} />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-medium text-text-primary">
                        {req.number}
                      </span>
                      <Badge variant={req.is_active ? 'success' : 'muted'} dot>
                        {req.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-text-muted">
                      <span>{req.owner}</span>
                      <span>&middot;</span>
                      <span>{req.bank_name}</span>
                      <span>&middot;</span>
                      <Badge variant="default">{req.type}</Badge>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="ghost" onClick={() => openEditModal(req)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant={req.is_active ? 'danger' : 'success'}
                    onClick={() => toggleMutation.mutate({ id: req.id, active: !req.is_active })}
                    loading={toggleMutation.isPending}
                  >
                    {req.is_active ? <PowerOff className="h-3.5 w-3.5" /> : <Power className="h-3.5 w-3.5" />}
                    {req.is_active ? 'Disable' : 'Enable'}
                  </Button>
                </div>
              </div>

              <div className="space-y-3">
                <ProgressBar
                  label="Volume Used"
                  value={req.used_amount}
                  max={req.limit_amount}
                />
                <ProgressBar
                  label="Operations Used"
                  value={req.used_operations}
                  max={req.limit_operations}
                />
              </div>

              <div className="flex items-center justify-between rounded-lg bg-bg-secondary px-3 py-2 text-xs">
                <span className="text-text-muted">Amount Range</span>
                <span className="text-text-secondary font-medium">
                  {req.min_amount.toLocaleString()} – {req.max_amount.toLocaleString()}
                </span>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Add Requisite Modal */}
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
          <Input
            label="Bank Name"
            placeholder="e.g. Monobank, PrivatBank"
            value={form.bank_name}
            onChange={(e) => setForm({ ...form, bank_name: e.target.value })}
            required
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Min Amount"
              type="number"
              value={String(form.min_amount)}
              onChange={(e) => setForm({ ...form, min_amount: Number(e.target.value) })}
              required
            />
            <Input
              label="Max Amount"
              type="number"
              value={String(form.max_amount)}
              onChange={(e) => setForm({ ...form, max_amount: Number(e.target.value) })}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Volume Limit"
              type="number"
              value={String(form.limit_amount)}
              onChange={(e) => setForm({ ...form, limit_amount: Number(e.target.value) })}
              required
            />
            <Input
              label="Operations Limit"
              type="number"
              value={String(form.limit_operations)}
              onChange={(e) => setForm({ ...form, limit_operations: Number(e.target.value) })}
              required
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

      {/* Edit Limits Modal */}
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
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Min Amount"
                type="number"
                value={String(form.min_amount)}
                onChange={(e) => setForm({ ...form, min_amount: Number(e.target.value) })}
                required
              />
              <Input
                label="Max Amount"
                type="number"
                value={String(form.max_amount)}
                onChange={(e) => setForm({ ...form, max_amount: Number(e.target.value) })}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Volume Limit"
                type="number"
                value={String(form.limit_amount)}
                onChange={(e) => setForm({ ...form, limit_amount: Number(e.target.value) })}
                required
              />
              <Input
                label="Operations Limit"
                type="number"
                value={String(form.limit_operations)}
                onChange={(e) => setForm({ ...form, limit_operations: Number(e.target.value) })}
                required
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
