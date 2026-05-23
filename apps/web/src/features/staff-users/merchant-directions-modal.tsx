'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Lock, Unlock, Trash2, Pencil, Ban, X } from 'lucide-react';
import { api } from '@/lib/api';
import { internalPaths } from '@/lib/internal-api';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { NumberInput } from '@/components/ui/number-input';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import { parseDecimalInput } from '@/lib/decimal-input';
import { currencyKeys, fetchCurrencyList, staffKeys } from '@/lib/query-keys';
import { CurrencySelectWithCreate } from '@/features/currencies/currency-select-with-create';
import type { StaffRolePrefix } from '@/features/traders';
import { currencyCodeFromUnknown } from '@/lib/currency-code';

interface MerchantBlockedAmount {
  id: string;
  amount: string;
  note: string | null;
  createdAt: string;
}

interface MerchantDirection {
  id: string;
  directionType: 'PAYIN' | 'PAYOUT';
  currency: unknown;
  minAmount: string;
  maxAmount: string;
  defaultCommissionPercent: string;
  isActive: boolean;
  blockedAmounts: MerchantBlockedAmount[];
  commissionTiers: Array<{
    id: string;
    amountFrom: string;
    amountTo: string | null;
    commissionPercent: string;
  }>;
}

type DirectionForm = {
  directionType: 'PAYIN' | 'PAYOUT';
  currency: string;
  minAmount: number;
  maxAmount: number;
  defaultCommissionPercent: number;
};

type LimitsForm = Pick<DirectionForm, 'minAmount' | 'maxAmount' | 'defaultCommissionPercent'>;

const DIR_LABELS: Record<string, string> = { PAYIN: 'Pay-In', PAYOUT: 'Pay-Out' };

const DEFAULT_DIR_FORM: DirectionForm = {
  directionType: 'PAYIN',
  currency: 'UAH',
  minAmount: 0,
  maxAmount: 0,
  defaultCommissionPercent: 5,
};

function formatLimit(value: string | number): string {
  const n = Number(value);
  return n === 0 ? 'none' : n.toLocaleString();
}

export interface MerchantDirectionsModalProps {
  queryKeyPrefix: StaffRolePrefix;
  merchantId: string | null;
  merchantName: string;
  open: boolean;
  onClose: () => void;
  onChanged?: () => void;
  /** Open the add-direction form when the merchant has no directions yet (e.g. right after profile creation). */
  initialShowAddDirection?: boolean;
}

export function MerchantDirectionsModal({
  queryKeyPrefix,
  merchantId,
  merchantName,
  open,
  onClose,
  onChanged,
  initialShowAddDirection = false,
}: MerchantDirectionsModalProps) {
  const queryClient = useQueryClient();
  const [showAddDir, setShowAddDir] = useState(false);
  const [dirForm, setDirForm] = useState<DirectionForm>(DEFAULT_DIR_FORM);
  const [editingDirId, setEditingDirId] = useState<string | null>(null);
  const [limitsForm, setLimitsForm] = useState<LimitsForm>({
    minAmount: 0,
    maxAmount: 0,
    defaultCommissionPercent: 0,
  });
  const [blockedDrafts, setBlockedDrafts] = useState<
    Record<string, { amount: number; note: string }>
  >({});

  const { data: merchantDirections, isLoading: dirsLoading } = useQuery({
    queryKey: staffKeys.merchantDirections(queryKeyPrefix, merchantId),
    queryFn: () => api.get<MerchantDirection[]>(internalPaths.merchantDirections(merchantId!)),
    enabled: open && !!merchantId,
  });

  const { data: currencies = [] } = useQuery({
    queryKey: currencyKeys.list(),
    queryFn: fetchCurrencyList,
    enabled: open,
  });

  useEffect(() => {
    if (!open) {
      setShowAddDir(false);
      setEditingDirId(null);
      setDirForm(DEFAULT_DIR_FORM);
      setBlockedDrafts({});
      return;
    }
    if (
      initialShowAddDirection &&
      !dirsLoading &&
      (merchantDirections ?? []).length === 0
    ) {
      setShowAddDir(true);
    }
  }, [open, initialShowAddDirection, dirsLoading, merchantDirections]);

  const directionCurrencyOptions = useMemo(() => {
    const active = currencies
      .filter((c) => c.isActive)
      .map((c) => ({ value: c.code.toUpperCase(), label: c.code.toUpperCase() }));
    const v = dirForm.currency.trim().toUpperCase();
    if (v && !active.some((o) => o.value === v)) {
      active.push({ value: v, label: `${v} (inactive)` });
    }
    active.sort((a, b) => a.value.localeCompare(b.value));
    return active;
  }, [currencies, dirForm.currency]);

  const patchDirectionInCache = (updated: MerchantDirection) => {
    const mid = merchantId;
    if (!mid) return;
    queryClient.setQueryData<MerchantDirection[]>(
      staffKeys.merchantDirections(queryKeyPrefix, mid),
      (old) => {
        if (!old) return [updated];
        const next = old.map((d) => (d.id === updated.id ? updated : d));
        next.sort(
          (a, b) =>
            a.directionType.localeCompare(b.directionType) ||
            currencyCodeFromUnknown(a.currency).localeCompare(currencyCodeFromUnknown(b.currency)),
        );
        return next;
      },
    );
  };

  const createDirection = useMutation({
    mutationFn: (body: DirectionForm) =>
      api.post<MerchantDirection>(internalPaths.merchantDirections(merchantId!), body),
    onSuccess: (row) => {
      patchDirectionInCache(row);
      setShowAddDir(false);
      setDirForm(DEFAULT_DIR_FORM);
      onChanged?.();
    },
  });

  const updateDirection = useMutation({
    mutationFn: ({ dirId, body }: { dirId: string; body: LimitsForm }) =>
      api.patch<MerchantDirection>(internalPaths.merchantDirection(merchantId!, dirId), body),
    onSuccess: (updated) => {
      patchDirectionInCache(updated);
      setEditingDirId(null);
      onChanged?.();
    },
  });

  const deleteDirection = useMutation({
    mutationFn: ({ dirId }: { dirId: string }) =>
      api.delete(internalPaths.merchantDirection(merchantId!, dirId)),
    onSuccess: (_data, variables) => {
      const mid = merchantId;
      if (!mid) return;
      queryClient.setQueryData<MerchantDirection[]>(
        staffKeys.merchantDirections(queryKeyPrefix, mid),
        (old) => old?.filter((d) => d.id !== variables.dirId) ?? [],
      );
      if (editingDirId === variables.dirId) setEditingDirId(null);
      onChanged?.();
    },
  });

  const toggleDirection = useMutation({
    mutationFn: ({ dirId, isActive }: { dirId: string; isActive: boolean }) =>
      api.patch<MerchantDirection>(internalPaths.merchantDirection(merchantId!, dirId), {
        isActive: !isActive,
      }),
    onSuccess: (updated) => {
      patchDirectionInCache(updated);
      onChanged?.();
    },
  });

  const addBlockedAmount = useMutation({
    mutationFn: ({
      dirId,
      amount,
      note,
    }: {
      dirId: string;
      amount: number;
      note?: string;
    }) =>
      api.post<MerchantDirection>(
        internalPaths.merchantDirectionBlockedAmounts(merchantId!, dirId),
        { amount, note: note?.trim() || undefined },
      ),
    onSuccess: (updated, variables) => {
      patchDirectionInCache(updated);
      setBlockedDrafts((prev) => ({
        ...prev,
        [variables.dirId]: { amount: 0, note: '' },
      }));
      onChanged?.();
    },
  });

  const removeBlockedAmount = useMutation({
    mutationFn: ({ dirId, blockedAmountId }: { dirId: string; blockedAmountId: string }) =>
      api.delete<MerchantDirection>(
        internalPaths.merchantDirectionBlockedAmount(merchantId!, dirId, blockedAmountId),
      ),
    onSuccess: (updated) => {
      patchDirectionInCache(updated);
      onChanged?.();
    },
  });

  const startEditLimits = (dir: MerchantDirection) => {
    setEditingDirId(dir.id);
    setLimitsForm({
      minAmount: Number(dir.minAmount),
      maxAmount: Number(dir.maxAmount),
      defaultCommissionPercent: Number(dir.defaultCommissionPercent),
    });
    setShowAddDir(false);
  };

  const handleClose = () => {
    setShowAddDir(false);
    setEditingDirId(null);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={`Merchant controls — ${merchantName}`}
      size="lg"
    >
      <div className="space-y-4">
        <p className="text-sm text-text-muted">
          Configure order amount limits (min/max), blocked exact amounts, and commissions per direction.
          Use <span className="font-mono">0</span> for min/max to mean no bound.
        </p>

        {dirsLoading && <p className="text-sm text-text-muted">Loading…</p>}

        {!dirsLoading && (merchantDirections ?? []).length === 0 && !showAddDir && (
          <p className="text-sm text-text-muted py-4 text-center">
            No directions configured — global defaults apply until you add a direction.
          </p>
        )}

        {(merchantDirections ?? []).map((dir) => {
          const dirCurrency = currencyCodeFromUnknown(dir.currency);
          const isEditing = editingDirId === dir.id;
          const blockedDraft = blockedDrafts[dir.id] ?? { amount: 0, note: '' };

          return (
            <div
              key={dir.id}
              className="rounded-lg border border-border-primary bg-bg-secondary p-4 space-y-3"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge color={dir.directionType === 'PAYIN' ? 'blue' : 'yellow'}>
                    {DIR_LABELS[dir.directionType]}
                  </Badge>
                  <span className="font-mono font-semibold text-text-primary">{dirCurrency}</span>
                  <Badge color={dir.isActive ? 'green' : 'red'}>
                    {dir.isActive ? 'active' : 'inactive'}
                  </Badge>
                </div>
                <div className="flex gap-2">
                  {!isEditing ? (
                    <IconButton
                      label="Edit min/max limits"
                      variant="ghost"
                      onClick={() => startEditLimits(dir)}
                    >
                      <Pencil className="h-4 w-4" />
                    </IconButton>
                  ) : null}
                  <IconButton
                    label={dir.isActive ? 'Deactivate direction' : 'Activate direction'}
                    variant="ghost"
                    onClick={() => toggleDirection.mutate({ dirId: dir.id, isActive: dir.isActive })}
                  >
                    {dir.isActive ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
                  </IconButton>
                  <IconButton
                    label="Delete direction"
                    variant="danger"
                    onClick={() => deleteDirection.mutate({ dirId: dir.id })}
                  >
                    <Trash2 className="h-4 w-4" />
                  </IconButton>
                </div>
              </div>

              {isEditing ? (
                <form
                  className="rounded-lg border border-border-primary border-dashed p-3 space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    updateDirection.mutate({ dirId: dir.id, body: limitsForm });
                  }}
                >
                  <p className="text-sm font-medium text-text-primary">Edit limits</p>
                  <div className="grid grid-cols-3 gap-3">
                    <NumberInput
                      label="Min amount"
                      variant="amount"
                      min={0}
                      value={limitsForm.minAmount}
                      onChange={(e) =>
                        setLimitsForm({
                          ...limitsForm,
                          minAmount: parseDecimalInput(e.target.value) || 0,
                        })
                      }
                    />
                    <NumberInput
                      label="Max amount"
                      variant="amount"
                      min={0}
                      value={limitsForm.maxAmount}
                      onChange={(e) =>
                        setLimitsForm({
                          ...limitsForm,
                          maxAmount: parseDecimalInput(e.target.value) || 0,
                        })
                      }
                    />
                    <NumberInput
                      label="Commission"
                      variant="percent"
                      suffix="%"
                      min={0}
                      value={limitsForm.defaultCommissionPercent}
                      onChange={(e) =>
                        setLimitsForm({
                          ...limitsForm,
                          defaultCommissionPercent: parseDecimalInput(e.target.value) || 0,
                        })
                      }
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      type="button"
                      onClick={() => setEditingDirId(null)}
                    >
                      Cancel
                    </Button>
                    <Button size="sm" type="submit" loading={updateDirection.isPending}>
                      Save limits
                    </Button>
                  </div>
                </form>
              ) : (
                <div className="grid grid-cols-3 gap-3 text-sm">
                  <div>
                    <p className="text-text-muted text-xs">Min / max</p>
                    <p className="text-text-primary">
                      {formatLimit(dir.minAmount)} — {formatLimit(dir.maxAmount)} {dirCurrency}
                    </p>
                  </div>
                  <div>
                    <p className="text-text-muted text-xs">Commission (default)</p>
                    <p className="text-text-primary font-mono">
                      {Number(dir.defaultCommissionPercent).toFixed(2)}%
                    </p>
                  </div>
                  <div>
                    <p className="text-text-muted text-xs">Pricing tiers</p>
                    <p className="text-text-primary">{dir.commissionTiers.length}</p>
                  </div>
                </div>
              )}

              {dir.commissionTiers.length > 0 && (
                <div className="border-t border-border-primary pt-2">
                  <p className="text-xs text-text-muted mb-1">Commission tiers:</p>
                  <div className="space-y-1">
                    {dir.commissionTiers.map((t) => (
                      <div
                        key={t.id}
                        className="flex items-center gap-2 text-xs font-mono text-text-secondary"
                      >
                        <span>
                          {Number(t.amountFrom).toLocaleString()} —{' '}
                          {t.amountTo ? Number(t.amountTo).toLocaleString() : '∞'}
                        </span>
                        <span className="text-green-400">
                          {Number(t.commissionPercent).toFixed(2)}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="border-t border-border-primary pt-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Ban className="h-4 w-4 text-text-muted" />
                  <p className="text-sm font-medium text-text-primary">Blocked amounts</p>
                </div>
                <p className="text-xs text-text-muted">
                  Exact order amounts rejected at API creation for this direction.
                </p>

                {(dir.blockedAmounts ?? []).length === 0 ? (
                  <p className="text-xs text-text-muted">No blocked amounts.</p>
                ) : (
                  <div className="space-y-1">
                    {(dir.blockedAmounts ?? []).map((b) => (
                      <div
                        key={b.id}
                        className="flex items-center justify-between gap-2 rounded-md bg-bg-primary px-2 py-1.5 text-sm"
                      >
                        <div className="min-w-0">
                          <span className="font-mono text-text-primary">
                            {Number(b.amount).toLocaleString()} {dirCurrency}
                          </span>
                          {b.note ? (
                            <span className="ml-2 text-xs text-text-muted truncate">{b.note}</span>
                          ) : null}
                        </div>
                        <IconButton
                          label="Remove blocked amount"
                          variant="danger"
                          onClick={() =>
                            removeBlockedAmount.mutate({ dirId: dir.id, blockedAmountId: b.id })
                          }
                        >
                          <X className="h-4 w-4" />
                        </IconButton>
                      </div>
                    ))}
                  </div>
                )}

                <form
                  className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (blockedDraft.amount <= 0) return;
                    addBlockedAmount.mutate({
                      dirId: dir.id,
                      amount: blockedDraft.amount,
                      note: blockedDraft.note,
                    });
                  }}
                >
                  <NumberInput
                    label="Block amount"
                    variant="amount"
                    min={0}
                    value={blockedDraft.amount}
                    onChange={(e) =>
                      setBlockedDrafts((prev) => ({
                        ...prev,
                        [dir.id]: {
                          ...blockedDraft,
                          amount: parseDecimalInput(e.target.value) || 0,
                        },
                      }))
                    }
                  />
                  <Input
                    label="Note (optional)"
                    value={blockedDraft.note}
                    onChange={(e) =>
                      setBlockedDrafts((prev) => ({
                        ...prev,
                        [dir.id]: { ...blockedDraft, note: e.target.value },
                      }))
                    }
                    placeholder="Reason"
                  />
                  <Button
                    size="sm"
                    type="submit"
                    loading={addBlockedAmount.isPending}
                    disabled={blockedDraft.amount <= 0}
                  >
                    Block
                  </Button>
                </form>
              </div>
            </div>
          );
        })}

        {!showAddDir ? (
          <Button variant="ghost" size="sm" onClick={() => setShowAddDir(true)}>
            <Plus className="h-4 w-4" /> Add direction
          </Button>
        ) : (
          <form
            className="rounded-lg border border-border-primary border-dashed p-4 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              createDirection.mutate(dirForm);
            }}
          >
            <p className="text-sm font-medium text-text-primary">New direction</p>
            <div className="grid grid-cols-2 gap-3">
              <Select
                label="Type"
                options={[
                  { value: 'PAYIN', label: 'Pay-In' },
                  { value: 'PAYOUT', label: 'Pay-Out' },
                ]}
                value={dirForm.directionType}
                onChange={(e) =>
                  setDirForm({ ...dirForm, directionType: e.target.value as 'PAYIN' | 'PAYOUT' })
                }
              />
              <CurrencySelectWithCreate
                label="Currency"
                placeholder="Select currency"
                options={directionCurrencyOptions}
                value={dirForm.currency}
                onChange={(e) => setDirForm({ ...dirForm, currency: e.target.value.toUpperCase() })}
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <NumberInput
                label="Min amount"
                variant="amount"
                min={0}
                value={dirForm.minAmount}
                onChange={(e) =>
                  setDirForm({ ...dirForm, minAmount: parseDecimalInput(e.target.value) || 0 })
                }
              />
              <NumberInput
                label="Max amount"
                variant="amount"
                min={0}
                value={dirForm.maxAmount}
                onChange={(e) =>
                  setDirForm({ ...dirForm, maxAmount: parseDecimalInput(e.target.value) || 0 })
                }
              />
              <NumberInput
                label="Commission"
                variant="percent"
                suffix="%"
                min={0}
                value={dirForm.defaultCommissionPercent}
                onChange={(e) =>
                  setDirForm({
                    ...dirForm,
                    defaultCommissionPercent: parseDecimalInput(e.target.value) || 0,
                  })
                }
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" type="button" onClick={() => setShowAddDir(false)}>
                Cancel
              </Button>
              <Button size="sm" type="submit" loading={createDirection.isPending}>
                Add
              </Button>
            </div>
          </form>
        )}

        <div className="flex justify-end border-t border-border-primary pt-2">
          <Button variant="ghost" onClick={handleClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
}
