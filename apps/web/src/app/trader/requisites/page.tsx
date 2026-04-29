'use client';

import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CreditCard,
  Plus,
  RefreshCw,
  Pencil,
  Hash,
  ChevronDown,
  ChevronRight,
  Trash2,
  History,
  Search,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Modal } from '@/components/ui/modal';
import { Input } from '@/components/ui/input';
import { NumberInput } from '@/components/ui/number-input';
import { Select } from '@/components/ui/select';
import { ProgressBar } from '@/components/ui/progress-bar';
import { Table } from '@/components/ui/table';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { getUserFromToken } from '@/lib/auth';
import { RequisiteType } from '@p2p/shared';

interface VolumeBreakdown {
  amountInProcessing: number;
  amountCompleted: number;
  amountRemaining: number;
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
  currency: string;
  bank: { id: number; name: string } | null;
  volume?: VolumeBreakdown;
}

interface RequisiteGroupApi {
  id: string;
  name: string;
  currency: string;
  isActive: boolean;
  archivedAt: string | null;
  createdAt: string;
  paymentMethod: { id: string; displayName: string; name: string } | null;
  requisites: RequisiteApiRow[];
}

interface BankOption {
  id: number;
  name: string;
}

interface CurrencyRow {
  code: string;
  isActive: boolean;
}

interface PaymentMethodRow {
  id: string;
  displayName: string;
  name: string;
}

interface AuditItem {
  id: string;
  action: string;
  entityType: string;
  createdAt: string;
  actor: { email: string; role: string } | null;
  oldValue: unknown;
  newValue: unknown;
}

function num(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return Number(v);
  return Number(v);
}

function compactAmount(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
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
  const traderLabel = getUserFromToken()?.email?.split('@')[0] ?? 'Trader';

  const [archivedTab, setArchivedTab] = useState(false);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const [showAddGroupModal, setShowAddGroupModal] = useState(false);
  const [groupForm, setGroupForm] = useState({
    name: '',
    currency: 'UAH',
    payment_method_id: '',
  });

  const [addRequisiteGroupId, setAddRequisiteGroupId] = useState<string | null>(null);
  const [form, setForm] = useState<RequisiteFormData>(defaultForm);

  const [editingRequisite, setEditingRequisite] = useState<{
    groupId: string;
    row: RequisiteApiRow;
  } | null>(null);

  const [editingGroup, setEditingGroup] = useState<RequisiteGroupApi | null>(null);
  const [groupEditForm, setGroupEditForm] = useState({
    name: '',
    payment_method_id: '',
  });

  const [historyRequisiteId, setHistoryRequisiteId] = useState<string | null>(null);

  const { data: banks = [] } = useQuery({
    queryKey: ['banks', 'list'],
    queryFn: () => api.get<BankOption[]>('/api/banks'),
  });

  const { data: currencies = [] } = useQuery({
    queryKey: ['currencies', 'list'],
    queryFn: () => api.get<CurrencyRow[]>('/api/currencies'),
  });

  const { data: paymentMethods = [] } = useQuery({
    queryKey: ['payment-methods', 'list'],
    queryFn: () => api.get<PaymentMethodRow[]>('/api/payment-methods?activeOnly=true'),
  });

  const groupsQueryKey = ['trader', 'requisite-groups', archivedTab] as const;

  const { data: groups = [], isLoading, refetch } = useQuery({
    queryKey: groupsQueryKey,
    queryFn: () =>
      api.get<RequisiteGroupApi[]>(
        `/api/requisite-groups/my?archived=${archivedTab}&includeInactiveRequisites=true`,
      ),
  });

  type PayinAssignRangeRow = {
    requisite_id: string;
    eff_min: number | null;
    eff_max: number | null;
    fork_autolimit_active: boolean;
    participates_in_cascade: boolean;
  };

  const { data: assignRangesData } = useQuery({
    queryKey: ['trader', 'payin-assign-ranges'],
    queryFn: () =>
      api.get<{ requisites: PayinAssignRangeRow[] }>(
        '/api/trader/dashboard/payin-assign-ranges',
      ),
  });

  const assignRangeByReqId = useMemo(() => {
    const m = new Map<string, PayinAssignRangeRow>();
    for (const row of assignRangesData?.requisites ?? []) {
      m.set(row.requisite_id, row);
    }
    return m;
  }, [assignRangesData]);

  const { data: historyData, isLoading: historyLoading } = useQuery({
    queryKey: ['requisite', 'history', historyRequisiteId],
    queryFn: () =>
      api.get<{ items: AuditItem[]; total: number; page: number; limit: number }>(
        `/api/requisites/${historyRequisiteId}/history`,
        { limit: '50' },
      ),
    enabled: !!historyRequisiteId,
  });

  const filteredGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter((g) => {
      if (g.name.toLowerCase().includes(q) || g.currency.toLowerCase().includes(q)) {
        return true;
      }
      return g.requisites.some(
        (r) =>
          r.number.toLowerCase().includes(q) ||
          r.owner.toLowerCase().includes(q) ||
          (r.bank?.name ?? '').toLowerCase().includes(q),
      );
    });
  }, [groups, search]);

  const invalidateGroups = () => {
    queryClient.invalidateQueries({ queryKey: ['trader', 'requisite-groups'] });
    queryClient.invalidateQueries({ queryKey: ['trader', 'payin-assign-ranges'] });
  };

  const createGroupMutation = useMutation({
    mutationFn: () =>
      api.post('/api/requisite-groups/my', {
        name: groupForm.name,
        currency: groupForm.currency,
        ...(groupForm.payment_method_id
          ? { paymentMethodId: groupForm.payment_method_id }
          : {}),
      }),
    onSuccess: () => {
      invalidateGroups();
      setShowAddGroupModal(false);
      setGroupForm({ name: '', currency: 'UAH', payment_method_id: '' });
    },
  });

  const updateGroupMutation = useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: string;
      body: { name?: string; isActive?: boolean; paymentMethodId?: string | null };
    }) => api.patch(`/api/requisite-groups/my/${id}`, body),
    onSuccess: () => {
      invalidateGroups();
      setEditingGroup(null);
    },
  });

  const restoreGroupMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/api/requisite-groups/my/${id}/restore`),
    onSuccess: () => invalidateGroups(),
  });

  const deleteGroupMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/requisite-groups/my/${id}`),
    onSuccess: () => invalidateGroups(),
  });

  const createMutation = useMutation({
    mutationFn: ({ groupId, data }: { groupId: string; data: RequisiteFormData }) => {
      const bankId = data.bank_id ? Number(data.bank_id) : undefined;
      return api.post('/api/requisites/my', {
        groupId,
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
      invalidateGroups();
      setAddRequisiteGroupId(null);
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
      invalidateGroups();
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
    onSuccess: () => invalidateGroups(),
  });

  function toggleExpanded(id: string) {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function openEditRequisite(groupId: string, req: RequisiteApiRow) {
    setEditingRequisite({ groupId, row: req });
    setForm({
      type: req.type,
      number: req.number,
      owner: req.owner,
      bank_id: '',
      accepts_other_banks: req.acceptsOtherBanks,
      min_amount: num(req.minAmount),
      max_amount: num(req.maxAmount),
      limit_amount: num(req.limitTotalAmount),
      limit_operations: req.limitTotalOps,
    });
  }

  function openEditGroup(g: RequisiteGroupApi) {
    setEditingGroup(g);
    setGroupEditForm({
      name: g.name,
      payment_method_id: g.paymentMethod?.id ?? '',
    });
  }

  const bankOptions = banks.map((b) => ({ value: String(b.id), label: b.name }));
  const currencyOptions = currencies
    .filter((c) => c.isActive)
    .map((c) => ({ value: c.code, label: c.code }));
  const pmOptions = paymentMethods.map((p) => ({
    value: p.id,
    label: p.displayName || p.name,
  }));

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-3">
          <CreditCard className="h-6 w-6 text-accent-blue" />
          <div>
            <h1 className="text-2xl font-bold text-text-primary">Payment methods</h1>
            <p className="text-sm text-text-muted">
              Manage pay-in groups, requisites, limits, and activity. New groups and requisites appear
              at the top.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          {!archivedTab && (
            <Button
              onClick={() => {
                setGroupForm((f) => ({ ...f, currency: f.currency || 'UAH' }));
                setShowAddGroupModal(true);
              }}
            >
              <Plus className="h-4 w-4" />
              Add payment method group
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex rounded-lg border border-border-primary p-0.5 bg-bg-secondary">
          <button
            type="button"
            className={cn(
              'rounded-md px-4 py-1.5 text-sm font-medium transition-colors',
              !archivedTab
                ? 'bg-accent-blue text-white'
                : 'text-text-muted hover:text-text-primary',
            )}
            onClick={() => setArchivedTab(false)}
          >
            Current
          </button>
          <button
            type="button"
            className={cn(
              'rounded-md px-4 py-1.5 text-sm font-medium transition-colors',
              archivedTab
                ? 'bg-accent-blue text-white'
                : 'text-text-muted hover:text-text-primary',
            )}
            onClick={() => setArchivedTab(true)}
          >
            Archived
          </button>
        </div>
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
          <Input
            className="pl-9"
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent-blue border-t-transparent" />
        </div>
      ) : filteredGroups.length === 0 ? (
        <Card className="text-center py-12">
          <CreditCard className="mx-auto h-10 w-10 text-text-muted mb-3" />
          <p className="text-text-muted">
            {archivedTab
              ? 'No archived groups.'
              : 'No payment method groups yet. Create one to add requisites.'}
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredGroups.map((g) => {
            const isOpen = expanded[g.id] ?? true;
            const created = new Date(g.createdAt).toLocaleDateString(undefined, {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
            });
            return (
              <Card key={g.id} className="overflow-hidden border-border-primary">
                <div
                  className={cn(
                    'flex flex-wrap items-center gap-3 border-b border-border-primary px-3 py-3 sm:px-4',
                    'bg-bg-secondary/50',
                  )}
                >
                  <button
                    type="button"
                    onClick={() => toggleExpanded(g.id)}
                    className="shrink-0 rounded p-1 text-text-muted hover:bg-bg-hover hover:text-text-primary"
                    aria-expanded={isOpen}
                  >
                    {isOpen ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </button>
                  <div className="grid min-w-0 flex-1 grid-cols-2 gap-3 sm:grid-cols-4">
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-text-muted">Created</p>
                      <p className="text-sm font-medium text-text-primary">{created}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-text-muted">Trader</p>
                      <p className="text-sm font-medium text-text-primary truncate">{traderLabel}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-text-muted">Name</p>
                      <p className="text-sm font-medium text-text-primary truncate">{g.name}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-text-muted">Currency</p>
                      <p className="text-sm font-medium text-text-primary">{g.currency}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {g.archivedAt ? (
                      <Badge variant="muted">Archived</Badge>
                    ) : (
                      <label className="flex items-center gap-2 text-xs text-text-secondary cursor-pointer">
                        <input
                          type="checkbox"
                          role="switch"
                          className="h-4 w-7 rounded-full accent-accent-blue"
                          checked={g.isActive}
                          onChange={(e) =>
                            updateGroupMutation.mutate({
                              id: g.id,
                              body: { isActive: e.target.checked },
                            })
                          }
                        />
                        Active
                      </label>
                    )}
                    {!g.archivedAt && (
                      <Button
                        size="sm"
                        variant="secondary"
                        className="h-8 w-8 rounded-full p-0"
                        onClick={() => {
                          setForm(defaultForm);
                          setAddRequisiteGroupId(g.id);
                        }}
                        title="Add requisite"
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    )}
                    {!g.archivedAt && (
                      <Button
                        size="sm"
                        variant="secondary"
                        className="h-8 w-8 rounded-full p-0"
                        onClick={() => openEditGroup(g)}
                        title="Edit group"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    )}
                    {g.archivedAt ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => restoreGroupMutation.mutate(g.id)}
                        loading={restoreGroupMutation.isPending}
                      >
                        Restore
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="danger"
                        className="h-8 w-8 rounded-full p-0"
                        onClick={() => {
                          if (
                            confirm(
                              'Delete this empty group only? Remove all requisites first if any remain.',
                            )
                          ) {
                            deleteGroupMutation.mutate(g.id);
                          }
                        }}
                        title="Delete group"
                        disabled={g.requisites.length > 0}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
                {isOpen && (
                  <div className="p-2 sm:p-3">
                    {g.requisites.length === 0 ? (
                      <p className="px-2 py-4 text-center text-sm text-text-muted">
                        No requisites in this group.
                      </p>
                    ) : (
                      <Table<RequisiteApiRow>
                        keyExtractor={(r) => r.id}
                        data={g.requisites}
                        columns={[
                          {
                            key: 'number',
                            header: 'Account number',
                            render: (r) => (
                              <span className="font-mono text-xs sm:text-sm">{r.number}</span>
                            ),
                          },
                          {
                            key: 'owner',
                            header: 'Account owner',
                            render: (r) => <span className="break-all">{r.owner}</span>,
                          },
                          {
                            key: 'bank',
                            header: 'Bank',
                            render: (r) => r.bank?.name ?? '—',
                          },
                          {
                            key: 'type',
                            header: 'Type',
                            render: (r) => <Badge variant="default">{r.type}</Badge>,
                          },
                          {
                            key: 'other',
                            header: 'Other banks',
                            render: (r) => (r.acceptsOtherBanks ? 'Yes' : 'No'),
                          },
                          {
                            key: 'vol',
                            header: 'Current amount',
                            className: 'min-w-[140px]',
                            render: (r) => {
                              const v = r.volume ?? {
                                amountInProcessing: 0,
                                amountCompleted: 0,
                                amountRemaining: Math.max(
                                  0,
                                  num(r.limitTotalAmount) - num(r.usedAmount),
                                ),
                              };
                              const lim = num(r.limitTotalAmount);
                              return (
                                <div className="space-y-1 text-[11px] leading-tight">
                                  <ProgressBar
                                    label=""
                                    value={num(r.usedAmount)}
                                    max={lim || 1}
                                  />
                                  <div className="text-text-muted">
                                    Processing:{' '}
                                    <span className="tabular-nums text-text-secondary">
                                      {compactAmount(v.amountInProcessing)}
                                    </span>
                                  </div>
                                  <div className="text-text-muted">
                                    Completed:{' '}
                                    <span className="tabular-nums text-text-secondary">
                                      {compactAmount(v.amountCompleted)}
                                    </span>
                                  </div>
                                  <div className="text-text-muted">
                                    Remaining:{' '}
                                    <span className="tabular-nums text-accent-green">
                                      {compactAmount(v.amountRemaining)}
                                    </span>
                                  </div>
                                </div>
                              );
                            },
                          },
                          {
                            key: 'range',
                            header: 'Amount range',
                            render: (r) => {
                              const ar = assignRangeByReqId.get(r.id);
                              const manualLo = num(r.minAmount);
                              const manualHi = num(r.maxAmount);
                              const hasEff =
                                ar &&
                                ar.eff_min != null &&
                                ar.eff_max != null;
                              const showAssign =
                                hasEff &&
                                (ar!.fork_autolimit_active ||
                                  !ar!.participates_in_cascade ||
                                  Math.abs(ar!.eff_min! - manualLo) > 0.01 ||
                                  Math.abs(ar!.eff_max! - manualHi) > 0.01);
                              return (
                                <div className="space-y-0.5">
                                  <span className="tabular-nums whitespace-nowrap text-xs">
                                    {compactAmount(manualLo)} ↔ {compactAmount(manualHi)}
                                  </span>
                                  {showAssign ? (
                                    <div className="text-[10px] leading-tight text-text-muted">
                                      Pay-In assignment:{' '}
                                      <span className="tabular-nums text-text-secondary">
                                        {compactAmount(ar!.eff_min!)} ↔ {compactAmount(ar!.eff_max!)}
                                      </span>
                                      {!ar!.participates_in_cascade ? (
                                        <span className="ml-1 text-amber-600">
                                          (not in cascade pool)
                                        </span>
                                      ) : null}
                                    </div>
                                  ) : ar && !ar.participates_in_cascade ? (
                                    <div className="text-[10px] text-amber-600">
                                      Not in cascade assignment pool
                                    </div>
                                  ) : null}
                                </div>
                              );
                            },
                          },
                          {
                            key: 'ops',
                            header: 'Operation limit',
                            className: 'min-w-[100px]',
                            render: (r) => (
                              <ProgressBar
                                label=""
                                value={r.usedOps}
                                max={r.limitTotalOps || 1}
                              />
                            ),
                          },
                          {
                            key: 'active',
                            header: 'Active',
                            render: (r) => (
                              <input
                                type="checkbox"
                                role="switch"
                                className="accent-accent-blue"
                                checked={r.isActive}
                                onChange={(e) =>
                                  toggleMutation.mutate({
                                    id: r.id,
                                    makeActive: e.target.checked,
                                  })
                                }
                              />
                            ),
                          },
                          {
                            key: 'actions',
                            header: 'Actions',
                            render: (r) => (
                              <div className="flex flex-wrap gap-1">
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => openEditRequisite(g.id, r)}
                                >
                                  Edit
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => setHistoryRequisiteId(r.id)}
                                >
                                  <History className="h-3.5 w-3.5" />
                                  History
                                </Button>
                              </div>
                            ),
                          },
                        ]}
                      />
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <Modal
        open={showAddGroupModal}
        onClose={() => setShowAddGroupModal(false)}
        title="Add payment method group"
        size="md"
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            createGroupMutation.mutate();
          }}
        >
          <Input
            label="Name"
            placeholder="e.g. Monobank cards"
            value={groupForm.name}
            onChange={(e) => setGroupForm({ ...groupForm, name: e.target.value })}
            required
          />
          <Select
            label="Currency"
            options={currencyOptions.length ? currencyOptions : [{ value: 'UAH', label: 'UAH' }]}
            value={groupForm.currency}
            onChange={(e) => setGroupForm({ ...groupForm, currency: e.target.value })}
          />
          <Select
            label="Catalog payment method (optional)"
            options={[{ value: '', label: '—' }, ...pmOptions]}
            value={groupForm.payment_method_id}
            onChange={(e) => setGroupForm({ ...groupForm, payment_method_id: e.target.value })}
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setShowAddGroupModal(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={createGroupMutation.isPending}>
              Create group
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={!!editingGroup}
        onClose={() => setEditingGroup(null)}
        title="Edit payment method group"
        size="md"
      >
        {editingGroup && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              updateGroupMutation.mutate({
                id: editingGroup.id,
                body: {
                  name: groupEditForm.name,
                  paymentMethodId: groupEditForm.payment_method_id || null,
                },
              });
            }}
          >
            <Input
              label="Name"
              value={groupEditForm.name}
              onChange={(e) => setGroupEditForm({ ...groupEditForm, name: e.target.value })}
              required
            />
            <Select
              label="Catalog payment method"
              options={[{ value: '', label: '—' }, ...pmOptions]}
              value={groupEditForm.payment_method_id}
              onChange={(e) =>
                setGroupEditForm({ ...groupEditForm, payment_method_id: e.target.value })
              }
            />
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={() => setEditingGroup(null)}>
                Cancel
              </Button>
              <Button type="submit" loading={updateGroupMutation.isPending}>
                Save
              </Button>
            </div>
          </form>
        )}
      </Modal>

      <Modal
        open={!!addRequisiteGroupId}
        onClose={() => setAddRequisiteGroupId(null)}
        title="Add requisite"
        size="md"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!addRequisiteGroupId) return;
            createMutation.mutate({ groupId: addRequisiteGroupId, data: form });
          }}
          className="space-y-4"
        >
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
            label={form.type === RequisiteType.CARD ? 'Card number' : 'IBAN'}
            placeholder={
              form.type === RequisiteType.CARD
                ? '0000 0000 0000 0000'
                : 'UA000000000000000000000000000'
            }
            value={form.number}
            onChange={(e) => setForm({ ...form, number: e.target.value })}
            required
          />
          <Input
            label="Owner name"
            placeholder="Account owner"
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
              label="Min amount"
              variant="amount"
              value={form.min_amount}
              onChange={(e) => setForm({ ...form, min_amount: Number(e.target.value) })}
            />
            <NumberInput
              label="Max amount"
              variant="amount"
              value={form.max_amount}
              onChange={(e) => setForm({ ...form, max_amount: Number(e.target.value) })}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <NumberInput
              label="Volume limit"
              variant="amount"
              value={form.limit_amount}
              onChange={(e) => setForm({ ...form, limit_amount: Number(e.target.value) })}
            />
            <NumberInput
              label="Operations limit"
              variant="integer"
              value={form.limit_operations}
              onChange={(e) => setForm({ ...form, limit_operations: Number(e.target.value) })}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setAddRequisiteGroupId(null)}>
              Cancel
            </Button>
            <Button type="submit" loading={createMutation.isPending}>
              Create requisite
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={!!editingRequisite}
        onClose={() => setEditingRequisite(null)}
        title="Edit requisite limits"
        size="md"
      >
        {editingRequisite && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              updateLimitsMutation.mutate({
                id: editingRequisite.row.id,
                limits: {
                  min_amount: form.min_amount,
                  max_amount: form.max_amount,
                  limit_amount: form.limit_amount,
                  limit_operations: form.limit_operations,
                },
                acceptsOtherBanks: form.accepts_other_banks,
              });
            }}
            className="space-y-4"
          >
            <div className="rounded-lg bg-bg-secondary p-3">
              <div className="flex items-center gap-2 text-sm">
                <Hash className="h-4 w-4 text-text-muted" />
                <span className="font-mono text-text-secondary">{editingRequisite.row.number}</span>
                <span className="text-text-muted">&middot;</span>
                <span className="text-text-muted">
                  {editingRequisite.row.bank?.name ?? '—'}
                </span>
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
                label="Min amount"
                variant="amount"
                value={form.min_amount}
                onChange={(e) => setForm({ ...form, min_amount: Number(e.target.value) })}
              />
              <NumberInput
                label="Max amount"
                variant="amount"
                value={form.max_amount}
                onChange={(e) => setForm({ ...form, max_amount: Number(e.target.value) })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <NumberInput
                label="Volume limit"
                variant="amount"
                value={form.limit_amount}
                onChange={(e) => setForm({ ...form, limit_amount: Number(e.target.value) })}
              />
              <NumberInput
                label="Operations limit"
                variant="integer"
                value={form.limit_operations}
                onChange={(e) => setForm({ ...form, limit_operations: Number(e.target.value) })}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={() => setEditingRequisite(null)}>
                Cancel
              </Button>
              <Button type="submit" loading={updateLimitsMutation.isPending}>
                Save changes
              </Button>
            </div>
          </form>
        )}
      </Modal>

      <Modal
        open={!!historyRequisiteId}
        onClose={() => setHistoryRequisiteId(null)}
        title="Requisite history"
        size="lg"
      >
        <div className="max-h-[60vh] overflow-y-auto space-y-2">
          {historyLoading ? (
            <p className="text-sm text-text-muted">Loading…</p>
          ) : !historyData?.items?.length ? (
            <p className="text-sm text-text-muted">No audit entries for this requisite yet.</p>
          ) : (
            historyData.items.map((row) => (
              <div
                key={row.id}
                className="rounded-lg border border-border-primary bg-bg-secondary px-3 py-2 text-xs"
              >
                <div className="flex flex-wrap justify-between gap-2 text-text-primary">
                  <span className="font-medium">{row.action}</span>
                  <span className="text-text-muted">
                    {new Date(row.createdAt).toLocaleString()}
                  </span>
                </div>
                {row.actor && (
                  <p className="mt-1 text-text-muted">
                    {row.actor.email} ({row.actor.role})
                  </p>
                )}
              </div>
            ))
          )}
        </div>
      </Modal>
    </div>
  );
}
