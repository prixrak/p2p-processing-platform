'use client';

import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Lock, Unlock, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { internalPaths } from '@/lib/internal-api';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { NumberInput } from '@/components/ui/number-input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import { parseDecimalInput } from '@/lib/decimal-input';
import { fetchCurrencyList } from '@/lib/currency-queries';
import { CurrencySelectWithCreate } from '@/features/currencies/currency-select-with-create';
import type { StaffRolePrefix } from '@/features/traders';

interface MerchantDirection {
  id: string;
  directionType: 'PAYIN' | 'PAYOUT';
  currency: string;
  minAmount: string;
  maxAmount: string;
  defaultCommissionPercent: string;
  isActive: boolean;
  commissionTiers: Array<{
    id: string;
    amountFrom: string;
    amountTo: string | null;
    commissionPercent: string;
  }>;
}

const DIR_LABELS: Record<string, string> = { PAYIN: 'Pay-In', PAYOUT: 'Pay-Out' };

export interface MerchantDirectionsModalProps {
  queryKeyPrefix: StaffRolePrefix;
  merchantId: string | null;
  merchantName: string;
  open: boolean;
  onClose: () => void;
  onChanged?: () => void;
}

export function MerchantDirectionsModal({
  queryKeyPrefix,
  merchantId,
  merchantName,
  open,
  onClose,
  onChanged,
}: MerchantDirectionsModalProps) {
  const queryClient = useQueryClient();
  const [showAddDir, setShowAddDir] = useState(false);
  const [dirForm, setDirForm] = useState<{
    directionType: 'PAYIN' | 'PAYOUT';
    currency: string;
    minAmount: number;
    maxAmount: number;
    defaultCommissionPercent: number;
  }>({
    directionType: 'PAYIN',
    currency: 'UAH',
    minAmount: 0,
    maxAmount: 0,
    defaultCommissionPercent: 5,
  });

  const { data: merchantDirections, isLoading: dirsLoading } = useQuery({
    queryKey: [queryKeyPrefix, 'merchant-directions', merchantId],
    queryFn: () => api.get<MerchantDirection[]>(internalPaths.merchantDirections(merchantId!)),
    enabled: open && !!merchantId,
  });

  const { data: currencies = [] } = useQuery({
    queryKey: ['currencies'],
    queryFn: fetchCurrencyList,
    enabled: open,
  });

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

  const createDirection = useMutation({
    mutationFn: (body: typeof dirForm) =>
      api.post<MerchantDirection>(internalPaths.merchantDirections(merchantId!), body),
    onSuccess: (row) => {
      const mid = merchantId;
      if (!mid) return;
      queryClient.setQueryData<MerchantDirection[]>(
        [queryKeyPrefix, 'merchant-directions', mid],
        (old) => {
          if (!old) return [row];
          const next = [...old.filter((d) => d.id !== row.id), row];
          next.sort(
            (a, b) =>
              a.directionType.localeCompare(b.directionType) || a.currency.localeCompare(b.currency),
          );
          return next;
        },
      );
      setShowAddDir(false);
      setDirForm({
        directionType: 'PAYIN',
        currency: 'UAH',
        minAmount: 0,
        maxAmount: 0,
        defaultCommissionPercent: 5,
      });
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
        [queryKeyPrefix, 'merchant-directions', mid],
        (old) => old?.filter((d) => d.id !== variables.dirId) ?? [],
      );
      onChanged?.();
    },
  });

  const toggleDirection = useMutation({
    mutationFn: ({ dirId, isActive }: { dirId: string; isActive: boolean }) =>
      api.patch<MerchantDirection>(internalPaths.merchantDirection(merchantId!, dirId), {
        isActive: !isActive,
      }),
    onSuccess: (updated, variables) => {
      const mid = merchantId;
      if (!mid) return;
      queryClient.setQueryData<MerchantDirection[]>(
        [queryKeyPrefix, 'merchant-directions', mid],
        (old) => old?.map((d) => (d.id === variables.dirId ? updated : d)) ?? [],
      );
      onChanged?.();
    },
  });

  const handleClose = () => {
    setShowAddDir(false);
    onClose();
  };

  return (
    <Modal open={open} onClose={handleClose} title={`Directions & commissions — ${merchantName}`} size="lg">
      <div className="space-y-4">
        {dirsLoading && <p className="text-sm text-text-muted">Loading…</p>}

        {!dirsLoading && (merchantDirections ?? []).length === 0 && (
          <p className="text-sm text-text-muted py-4 text-center">
            No directions configured — global defaults apply
          </p>
        )}

        {(merchantDirections ?? []).map((dir) => (
          <div
            key={dir.id}
            className="rounded-lg border border-border-primary bg-bg-secondary p-4 space-y-3"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge color={dir.directionType === 'PAYIN' ? 'blue' : 'yellow'}>
                  {DIR_LABELS[dir.directionType]}
                </Badge>
                <span className="font-mono font-semibold text-text-primary">{dir.currency}</span>
                <Badge color={dir.isActive ? 'green' : 'red'}>
                  {dir.isActive ? 'active' : 'inactive'}
                </Badge>
              </div>
              <div className="flex gap-2">
                <IconButton
                  label={dir.isActive ? 'Deactivate direction' : 'Activate direction'}
                  variant="ghost"
                  onClick={() => toggleDirection.mutate({ dirId: dir.id, isActive: dir.isActive })}
                >
                  {dir.isActive ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
                </IconButton>
                <IconButton
                  label="Delete direction"
                  variant="danger"
                  onClick={() => deleteDirection.mutate({ dirId: dir.id })}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </IconButton>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div>
                <p className="text-text-muted text-xs">Min/Max</p>
                <p className="text-text-primary">
                  {Number(dir.minAmount).toLocaleString()} — {Number(dir.maxAmount).toLocaleString()}{' '}
                  {dir.currency}
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
                      <span className="text-green-400">{Number(t.commissionPercent).toFixed(2)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}

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
                onChange={(e) => setDirForm({ ...dirForm, minAmount: parseDecimalInput(e.target.value) || 0 })}
              />
              <NumberInput
                label="Max amount"
                variant="amount"
                min={0}
                value={dirForm.maxAmount}
                onChange={(e) => setDirForm({ ...dirForm, maxAmount: parseDecimalInput(e.target.value) || 0 })}
              />
              <NumberInput
                label="Commission"
                variant="percent"
                suffix="%"
                min={0}
                value={dirForm.defaultCommissionPercent}
                onChange={(e) =>
                  setDirForm({ ...dirForm, defaultCommissionPercent: parseDecimalInput(e.target.value) || 0 })
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
