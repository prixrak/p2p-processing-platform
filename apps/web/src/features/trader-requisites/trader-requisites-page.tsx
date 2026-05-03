'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CreditCard,
  Plus,
  Pencil,
  ChevronDown,
  ChevronRight,
  Trash2,
  Search,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { internalPaths } from '@/lib/internal-api';
import { banksKeys, currencyKeys, fetchCurrencyList, paymentMethodsKeys, requisiteKeys, traderKeys } from '@/lib/query-keys';
import { cn } from '@/lib/utils';
import { getUserFromToken } from '@/lib/auth';
import type {
  AuditItem,
  BankOption,
  PaymentMethodRow,
  PayinAssignRangeRow,
  RequisiteApiRow,
  RequisiteFormData,
  RequisiteGroupApi,
} from './types';
import { defaultRequisiteForm, num, requisiteGroupCurrencyCode } from './utils';
import { TraderRequisitesGroupTable } from './requisite-group-table';
import {
  TraderAddGroupModal,
  TraderAddRequisiteModal,
  TraderEditGroupModal,
  TraderEditRequisiteLimitsModal,
  TraderRequisiteHistoryModal,
} from './requisite-modals';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

export function TraderRequisitesPage() {
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
  const [form, setForm] = useState<RequisiteFormData>(defaultRequisiteForm);

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
  const [deleteGroupId, setDeleteGroupId] = useState<string | null>(null);

  const { data: banks = [] } = useQuery({
    queryKey: banksKeys.list,
    queryFn: () => api.get<BankOption[]>(internalPaths.banks),
  });

  const { data: currencies = [] } = useQuery({
    queryKey: currencyKeys.list(),
    queryFn: fetchCurrencyList,
  });

  const { data: paymentMethods = [] } = useQuery({
    queryKey: paymentMethodsKeys.list,
    queryFn: () =>
      api.get<PaymentMethodRow[]>(internalPaths.paymentMethodsQuery('activeOnly=true')),
  });

  const groupsQueryKey = traderKeys.requisiteGroups(archivedTab);

  const { data: groups = [], isLoading } = useQuery({
    queryKey: groupsQueryKey,
    queryFn: () =>
      api.get<RequisiteGroupApi[]>(
        internalPaths.requisiteGroupsMy(`archived=${archivedTab}&includeInactiveRequisites=true`),
      ),
  });

  const { data: assignRangesData } = useQuery({
    queryKey: traderKeys.payinAssignRanges,
    queryFn: () =>
      api.get<{ requisites: PayinAssignRangeRow[] }>(internalPaths.traderDashboardPayinAssignRanges),
  });

  const assignRangeByReqId = useMemo(() => {
    const m = new Map<string, PayinAssignRangeRow>();
    for (const row of assignRangesData?.requisites ?? []) {
      m.set(row.requisite_id, row);
    }
    return m;
  }, [assignRangesData]);

  const { data: historyData, isLoading: historyLoading } = useQuery({
    queryKey: requisiteKeys.history(historyRequisiteId),
    queryFn: () =>
      api.get<{ items: AuditItem[]; total: number; page: number; limit: number }>(
        internalPaths.requisiteHistory(historyRequisiteId!),
        { limit: '50' },
      ),
    enabled: !!historyRequisiteId,
  });

  const filteredGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter((g) => {
      if (
        g.name.toLowerCase().includes(q) ||
        requisiteGroupCurrencyCode(g.currency).toLowerCase().includes(q)
      ) {
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
    queryClient.invalidateQueries({ queryKey: traderKeys.requisiteGroupsScope });
    queryClient.invalidateQueries({ queryKey: traderKeys.payinAssignRanges });
  };

  const createGroupMutation = useMutation({
    mutationFn: () =>
      api.post(internalPaths.requisiteGroupsMyRoot, {
        name: groupForm.name,
        currency: groupForm.currency,
        ...(groupForm.payment_method_id ? { paymentMethodId: groupForm.payment_method_id } : {}),
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
    }) => api.patch(internalPaths.requisiteGroupMy(id), body),
    onSuccess: () => {
      invalidateGroups();
      setEditingGroup(null);
    },
  });

  const restoreGroupMutation = useMutation({
    mutationFn: (id: string) => api.patch(internalPaths.requisiteGroupMyRestore(id)),
    onSuccess: () => invalidateGroups(),
  });

  const deleteGroupMutation = useMutation({
    mutationFn: (id: string) => api.delete(internalPaths.requisiteGroupMy(id)),
    onSuccess: () => invalidateGroups(),
  });

  const createMutation = useMutation({
    mutationFn: ({ groupId, data }: { groupId: string; data: RequisiteFormData }) => {
      const bankId = data.bank_id ? Number(data.bank_id) : undefined;
      return api.post(internalPaths.requisitesMy, {
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
      setForm(defaultRequisiteForm);
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
      api.put(internalPaths.requisite(id), {
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
        return api.patch(internalPaths.requisiteActivate(id));
      }
      return api.patch(internalPaths.requisiteDeactivate(id));
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
      <ConfirmDialog
        open={!!deleteGroupId}
        onOpenChange={(next) => !next && setDeleteGroupId(null)}
        tone="danger"
        title="Delete payment method group?"
        description="Only empty groups can be deleted. Remove all requisites first if any remain."
        confirmLabel="Delete group"
        loading={deleteGroupMutation.isPending}
        onConfirm={() => {
          if (!deleteGroupId) return;
          const id = deleteGroupId;
          deleteGroupMutation.mutate(id, {
            onSettled: () => setDeleteGroupId(null),
          });
        }}
      />
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-3">
          <CreditCard className="h-6 w-6 text-accent-blue" />
          <div>
            <h1 className="text-2xl font-bold text-text-primary">Payment methods</h1>
            <p className="text-sm text-text-muted">
              Manage pay-in groups, requisites, limits, and activity. New groups and requisites
              appear at the top.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 justify-end">
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
                      <p className="text-sm font-medium text-text-primary">
                        {requisiteGroupCurrencyCode(g.currency)}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {g.archivedAt ? (
                      <Badge variant="muted">Archived</Badge>
                    ) : (
                      <label
                        className={cn(
                          'flex items-center gap-2 text-xs text-text-secondary',
                          updateGroupMutation.isPending &&
                            updateGroupMutation.variables?.id === g.id
                            ? 'cursor-wait opacity-80'
                            : 'cursor-pointer',
                        )}
                      >
                        <input
                          type="checkbox"
                          role="switch"
                          className="h-4 w-7 rounded-full accent-accent-blue disabled:opacity-50"
                          checked={g.isActive}
                          disabled={
                            updateGroupMutation.isPending &&
                            updateGroupMutation.variables?.id === g.id
                          }
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
                      <IconButton
                        label="Add requisite"
                        variant="secondary"
                        onClick={() => {
                          setForm(defaultRequisiteForm);
                          setAddRequisiteGroupId(g.id);
                        }}
                      >
                        <Plus className="h-4 w-4" />
                      </IconButton>
                    )}
                    {!g.archivedAt && (
                      <IconButton
                        label="Edit group"
                        variant="secondary"
                        onClick={() => openEditGroup(g)}
                      >
                        <Pencil className="h-4 w-4" />
                      </IconButton>
                    )}
                    {g.archivedAt ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => restoreGroupMutation.mutate(g.id)}
                        loading={
                          restoreGroupMutation.isPending &&
                          restoreGroupMutation.variables === g.id
                        }
                      >
                        Restore
                      </Button>
                    ) : (
                      <IconButton
                        label="Delete group"
                        variant="danger"
                        onClick={() => setDeleteGroupId(g.id)}
                        disabled={g.requisites.length > 0}
                      >
                        <Trash2 className="h-4 w-4" />
                      </IconButton>
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
                      <TraderRequisitesGroupTable
                        groupId={g.id}
                        groupIsActive={g.isActive}
                        data={g.requisites}
                        assignRangeByReqId={assignRangeByReqId}
                        toggleMutation={toggleMutation}
                        onEditRequisite={openEditRequisite}
                        onHistory={setHistoryRequisiteId}
                      />
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <TraderAddGroupModal
        open={showAddGroupModal}
        onClose={() => setShowAddGroupModal(false)}
        groupForm={groupForm}
        setGroupForm={setGroupForm}
        currencyOptions={currencyOptions}
        pmOptions={pmOptions}
        createGroupMutation={createGroupMutation}
        onSubmit={() => createGroupMutation.mutate()}
      />

      <TraderEditGroupModal
        editingGroup={editingGroup}
        onClose={() => setEditingGroup(null)}
        groupEditForm={groupEditForm}
        setGroupEditForm={setGroupEditForm}
        pmOptions={pmOptions}
        updateGroupMutation={updateGroupMutation}
        onSubmit={() => {
          if (!editingGroup) return;
          updateGroupMutation.mutate({
            id: editingGroup.id,
            body: {
              name: groupEditForm.name,
              paymentMethodId: groupEditForm.payment_method_id || null,
            },
          });
        }}
      />

      <TraderAddRequisiteModal
        addRequisiteGroupId={addRequisiteGroupId}
        onClose={() => setAddRequisiteGroupId(null)}
        form={form}
        setForm={setForm}
        bankOptions={bankOptions}
        createMutation={createMutation}
        onSubmit={(groupId) => createMutation.mutate({ groupId, data: form })}
      />

      <TraderEditRequisiteLimitsModal
        editingRequisite={editingRequisite}
        onClose={() => setEditingRequisite(null)}
        form={form}
        setForm={setForm}
        updateLimitsMutation={updateLimitsMutation}
        onSubmit={() => {
          if (!editingRequisite) return;
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
      />

      <TraderRequisiteHistoryModal
        historyRequisiteId={historyRequisiteId}
        onClose={() => setHistoryRequisiteId(null)}
        historyLoading={historyLoading}
        items={historyData?.items}
      />
    </div>
  );
}
