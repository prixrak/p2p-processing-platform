'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
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
import { ListPageRefreshButton } from '@/components/ui/list-page-tools';
import { IconButton } from '@/components/ui/icon-button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { internalPaths } from '@/lib/internal-api';
import { banksKeys, currencyKeys, fetchCurrencyList, paymentMethodsKeys, requisiteKeys, traderKeys } from '@/lib/query-keys';
import { cn, formatDateTime } from '@/lib/utils';
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
import { defaultRequisiteForm, num, paymentMethodsForPayinCurrency, requisiteGroupCurrencyCode } from './utils';
import { textMatchesListSearch } from '@/lib/list-search';
import { TraderRequisitesGroupTable } from './requisite-group-table';
import {
  TraderAddGroupModal,
  TraderAddRequisiteModal,
  TraderEditGroupModal,
  TraderEditRequisiteLimitsModal,
  TraderRequisiteHistoryModal,
} from './requisite-modals';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { PaginationControls } from '@/components/ui/pagination-controls';
import { Tabs } from '@/components/ui/tabs';
import { DEFAULT_LIST_PAGE_SIZE, type ListPageSize } from '@/lib/list-pagination';

export function TraderRequisitesPage() {
  const t = useTranslations('Trader.Requisites');
  const tCommon = useTranslations('Trader.Common');
  const queryClient = useQueryClient();
  const traderLabel = getUserFromToken()?.email?.split('@')[0] ?? 'Trader';

  const [archivedTab, setArchivedTab] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<ListPageSize>(DEFAULT_LIST_PAGE_SIZE);
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

  const { data: groups = [], isLoading, isFetching: groupsFetching } = useQuery({
    queryKey: groupsQueryKey,
    queryFn: () =>
      api.get<RequisiteGroupApi[]>(
        internalPaths.requisiteGroupsMy(`archived=${archivedTab}&includeInactiveRequisites=true`),
      ),
  });

  const { data: assignRangesData, isFetching: assignRangesFetching } = useQuery({
    queryKey: traderKeys.payinAssignRanges,
    queryFn: () =>
      api.get<{ requisites: PayinAssignRangeRow[] }>(internalPaths.traderDashboardPayinAssignRanges),
    enabled: !archivedTab,
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
    const q = search.trim();
    if (!q) return groups;
    return groups.filter((g) => {
      if (
        textMatchesListSearch(q, g.name, requisiteGroupCurrencyCode(g.currency))
      ) {
        return true;
      }
      return g.requisites.some((r) =>
        textMatchesListSearch(
          q,
          r.number,
          r.owner,
          r.cardHolderName,
          r.bank?.name,
        ),
      );
    });
  }, [groups, search]);

  useEffect(() => {
    setPage(1);
  }, [search, archivedTab, pageSize]);

  const totalGroups = filteredGroups.length;
  const totalPages = Math.max(1, Math.ceil(totalGroups / pageSize));

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const paginatedGroups = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredGroups.slice(start, start + pageSize);
  }, [filteredGroups, page, pageSize]);

  const groupCreatePmOptions = useMemo(() => {
    return paymentMethodsForPayinCurrency(paymentMethods, groupForm.currency).map((p) => ({
      value: p.id,
      label: p.displayName || p.name,
    }));
  }, [paymentMethods, groupForm.currency]);

  const groupEditPmOptions = useMemo(() => {
    if (!editingGroup) return [];
    const code = requisiteGroupCurrencyCode(editingGroup.currency);
    let list = paymentMethodsForPayinCurrency(paymentMethods, code);
    const selectedId = editingGroup.paymentMethod.id;
    if (!list.some((p) => p.id === selectedId)) {
      const current = paymentMethods.find((p) => p.id === selectedId);
      if (current) {
        list = [current, ...list];
      } else {
        list = [
          {
            id: editingGroup.paymentMethod.id,
            displayName: editingGroup.paymentMethod.displayName,
            name: editingGroup.paymentMethod.name,
            availability: 'PAYIN' as const,
            country: { currency: { code } },
          },
          ...list,
        ];
      }
    }
    return list.map((p) => ({ value: p.id, label: p.displayName || p.name }));
  }, [paymentMethods, editingGroup]);

  const invalidateGroups = () => {
    queryClient.invalidateQueries({ queryKey: traderKeys.requisiteGroupsScope });
    queryClient.invalidateQueries({ queryKey: traderKeys.payinAssignRanges });
  };

  const createGroupMutation = useMutation({
    mutationFn: () =>
      api.post(internalPaths.requisiteGroupsMyRoot, {
        name: groupForm.name,
        currency: groupForm.currency,
        paymentMethodId: groupForm.payment_method_id,
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
      body: { name?: string; isActive?: boolean; paymentMethodId?: string };
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
      const bankId = Number(data.bank_id);
      return api.post(internalPaths.requisitesMy, {
        groupId,
        type: data.type,
        number: data.number,
        owner: data.owner,
        cardHolderName: data.card_holder_name,
        bankId,
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
      card_holder_name: req.cardHolderName,
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
      payment_method_id: g.paymentMethod.id,
    });
  }

  const bankOptions = banks.map((b) => ({ value: String(b.id), label: b.name }));
  const currencyOptions = currencies
    .filter((c) => c.isActive)
    .map((c) => ({ value: c.code, label: c.code }));

  return (
    <div className="space-y-6 animate-fade-in">
      <ConfirmDialog
        open={!!deleteGroupId}
        onOpenChange={(next) => !next && setDeleteGroupId(null)}
        tone="danger"
        title={t('archiveConfirmTitle')}
        description={t('archiveConfirmBody')}
        confirmLabel={t('archiveConfirmAction')}
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
            <h1 className="text-xl font-bold text-text-primary sm:text-2xl">{t('title')}</h1>
            <p className="text-sm text-text-muted">{t('subtitle')}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 sm:justify-end">
          <ListPageRefreshButton
            isRefreshing={groupsFetching || (!archivedTab && assignRangesFetching)}
            onRefresh={invalidateGroups}
          />
          <Tabs
            tabs={[
              { key: 'current', label: t('tabCurrent') },
              { key: 'archived', label: t('tabArchived') },
            ]}
            active={archivedTab ? 'archived' : 'current'}
            onChange={(k) => setArchivedTab(k === 'archived')}
          />
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="relative w-full max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
          <Input
            className="pl-9"
            placeholder={t('searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {!archivedTab ? (
          <div className="flex shrink-0 justify-end">
            <Button
              onClick={() => {
                setGroupForm((f) => ({ ...f, currency: f.currency || 'UAH' }));
                setShowAddGroupModal(true);
              }}
            >
              <Plus className="h-4 w-4" />
              {t('addGroup')}
            </Button>
          </div>
        ) : null}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent-blue border-t-transparent" />
        </div>
      ) : filteredGroups.length === 0 ? (
        <Card className="text-center py-12">
          <CreditCard className="mx-auto h-10 w-10 text-text-muted mb-3" />
          <p className="text-text-muted">
            {archivedTab ? t('emptyArchived') : t('emptyCurrent')}
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {paginatedGroups.map((g) => {
            const isOpen = expanded[g.id] ?? true;
            const created = formatDateTime(new Date(g.createdAt));
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
                      <p className="text-[10px] uppercase tracking-wide text-text-muted">{t('created')}</p>
                      <p className="text-sm font-medium text-text-primary">{created}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-text-muted">{t('trader')}</p>
                      <p className="text-sm font-medium text-text-primary truncate">{traderLabel}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-text-muted">{t('name')}</p>
                      <p className="text-sm font-medium text-text-primary truncate">{g.name}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-text-muted">{t('currency')}</p>
                      <p className="text-sm font-medium text-text-primary">
                        {requisiteGroupCurrencyCode(g.currency)}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {g.archivedAt ? (
                      <Badge variant="muted">{t('archived')}</Badge>
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
                        {t('active')}
                      </label>
                    )}
                    {!g.archivedAt && (
                      <IconButton
                        label={t('addRequisite')}
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
                        label={t('editGroup')}
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
                        {t('restore')}
                      </Button>
                    ) : (
                      <IconButton
                        label={t('archiveGroup')}
                        variant="danger"
                        onClick={() => setDeleteGroupId(g.id)}
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
                        {t('emptyGroupRequisites')}
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

      {!isLoading && filteredGroups.length > 0 ? (
        <PaginationControls
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
          totalItems={totalGroups}
          itemLabel={t('itemLabel')}
          variant="minimal"
          pageSize={pageSize}
          onPageSizeChange={setPageSize}
          rowsPerPageLabel={tCommon('rowsPerPage')}
        />
      ) : null}

      <TraderAddGroupModal
        open={showAddGroupModal}
        onClose={() => setShowAddGroupModal(false)}
        groupForm={groupForm}
        setGroupForm={setGroupForm}
        currencyOptions={currencyOptions}
        pmOptions={groupCreatePmOptions}
        createGroupMutation={createGroupMutation}
        onSubmit={() => createGroupMutation.mutate()}
      />

      <TraderEditGroupModal
        editingGroup={editingGroup}
        onClose={() => setEditingGroup(null)}
        groupEditForm={groupEditForm}
        setGroupEditForm={setGroupEditForm}
        pmOptions={groupEditPmOptions}
        updateGroupMutation={updateGroupMutation}
        onSubmit={() => {
          if (!editingGroup) return;
          updateGroupMutation.mutate({
            id: editingGroup.id,
            body: {
              name: groupEditForm.name,
              paymentMethodId: groupEditForm.payment_method_id,
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
