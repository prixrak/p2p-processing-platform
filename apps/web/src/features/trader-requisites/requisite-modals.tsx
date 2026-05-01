'use client';

import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { Hash } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { Input } from '@/components/ui/input';
import { NumberInput } from '@/components/ui/number-input';
import { Select } from '@/components/ui/select';
import { FormAlert } from '@/components/ui/form-alert';
import type { UseMutationResult } from '@tanstack/react-query';
import { RequisiteType } from '@p2p/shared';
import type { AuditItem, RequisiteApiRow, RequisiteFormData, RequisiteGroupApi } from './types';
import {
  requisiteCreateSchema,
  requisiteGroupCreateSchema,
  requisiteGroupEditSchema,
  requisiteLimitsSchema,
} from '@/lib/validation/schemas';
import { fieldErrorsFromZod } from '@/lib/validation/zod-field-errors';
import { errorMessageFromUnknown } from '@/lib/error-message';

export function TraderAddGroupModal({
  open,
  onClose,
  groupForm,
  setGroupForm,
  currencyOptions,
  pmOptions,
  createGroupMutation,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  groupForm: { name: string; currency: string; payment_method_id: string };
  setGroupForm: Dispatch<
    SetStateAction<{ name: string; currency: string; payment_method_id: string }>
  >;
  currencyOptions: { value: string; label: string }[];
  pmOptions: { value: string; label: string }[];
  createGroupMutation: UseMutationResult<unknown, unknown, void>;
  onSubmit: () => void;
}) {
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) setErrors({});
  }, [open]);

  return (
    <Modal open={open} onClose={onClose} title="Add payment method group" size="md">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          const parsed = requisiteGroupCreateSchema.safeParse(groupForm);
          if (!parsed.success) {
            setErrors(fieldErrorsFromZod(parsed.error));
            return;
          }
          setErrors({});
          onSubmit();
        }}
      >
        <Input
          label="Name"
          placeholder="e.g. Monobank cards"
          value={groupForm.name}
          onChange={(e) => setGroupForm({ ...groupForm, name: e.target.value })}
          error={errors.name}
        />
        <Select
          label="Currency"
          options={currencyOptions.length ? currencyOptions : [{ value: 'UAH', label: 'UAH' }]}
          value={groupForm.currency}
          onChange={(e) => setGroupForm({ ...groupForm, currency: e.target.value })}
          error={errors.currency}
        />
        <Select
          label="Catalog payment method (optional)"
          options={[{ value: '', label: '—' }, ...pmOptions]}
          value={groupForm.payment_method_id}
          onChange={(e) => setGroupForm({ ...groupForm, payment_method_id: e.target.value })}
        />
        {createGroupMutation.isError ? (
          <FormAlert>{errorMessageFromUnknown(createGroupMutation.error)}</FormAlert>
        ) : null}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={createGroupMutation.isPending}>
            Create group
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function TraderEditGroupModal({
  editingGroup,
  onClose,
  groupEditForm,
  setGroupEditForm,
  pmOptions,
  updateGroupMutation,
  onSubmit,
}: {
  editingGroup: RequisiteGroupApi | null;
  onClose: () => void;
  groupEditForm: { name: string; payment_method_id: string };
  setGroupEditForm: Dispatch<SetStateAction<{ name: string; payment_method_id: string }>>;
  pmOptions: { value: string; label: string }[];
  updateGroupMutation: UseMutationResult<
    unknown,
    unknown,
    {
      id: string;
      body: { name?: string; isActive?: boolean; paymentMethodId?: string | null };
    }
  >;
  onSubmit: () => void;
}) {
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!editingGroup) setErrors({});
  }, [editingGroup]);

  return (
    <Modal open={!!editingGroup} onClose={onClose} title="Edit payment method group" size="md">
      {editingGroup && (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const parsed = requisiteGroupEditSchema.safeParse(groupEditForm);
            if (!parsed.success) {
              setErrors(fieldErrorsFromZod(parsed.error));
              return;
            }
            setErrors({});
            onSubmit();
          }}
        >
          <Input
            label="Name"
            value={groupEditForm.name}
            onChange={(e) => setGroupEditForm({ ...groupEditForm, name: e.target.value })}
            error={errors.name}
          />
          <Select
            label="Catalog payment method"
            options={[{ value: '', label: '—' }, ...pmOptions]}
            value={groupEditForm.payment_method_id}
            onChange={(e) =>
              setGroupEditForm({ ...groupEditForm, payment_method_id: e.target.value })
            }
          />
          {updateGroupMutation.isError ? (
            <FormAlert>{errorMessageFromUnknown(updateGroupMutation.error)}</FormAlert>
          ) : null}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={updateGroupMutation.isPending}>
              Save
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

export function TraderAddRequisiteModal({
  addRequisiteGroupId,
  onClose,
  form,
  setForm,
  bankOptions,
  createMutation,
  onSubmit,
}: {
  addRequisiteGroupId: string | null;
  onClose: () => void;
  form: RequisiteFormData;
  setForm: Dispatch<SetStateAction<RequisiteFormData>>;
  bankOptions: { value: string; label: string }[];
  createMutation: UseMutationResult<
    unknown,
    unknown,
    { groupId: string; data: RequisiteFormData }
  >;
  onSubmit: (groupId: string) => void;
}) {
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!addRequisiteGroupId) setErrors({});
  }, [addRequisiteGroupId]);

  return (
    <Modal open={!!addRequisiteGroupId} onClose={onClose} title="Add requisite" size="md">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!addRequisiteGroupId) return;
          const parsed = requisiteCreateSchema.safeParse(form);
          if (!parsed.success) {
            setErrors(fieldErrorsFromZod(parsed.error));
            return;
          }
          setErrors({});
          onSubmit(addRequisiteGroupId);
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
          error={errors.type}
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
          error={errors.number}
        />
        <Input
          label="Owner name"
          placeholder="Account owner"
          value={form.owner}
          onChange={(e) => setForm({ ...form, owner: e.target.value })}
          error={errors.owner}
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
            error={errors.min_amount}
          />
          <NumberInput
            label="Max amount"
            variant="amount"
            value={form.max_amount}
            onChange={(e) => setForm({ ...form, max_amount: Number(e.target.value) })}
            error={errors.max_amount}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <NumberInput
            label="Volume limit"
            variant="amount"
            value={form.limit_amount}
            onChange={(e) => setForm({ ...form, limit_amount: Number(e.target.value) })}
            error={errors.limit_amount}
          />
          <NumberInput
            label="Operations limit"
            variant="integer"
            value={form.limit_operations}
            onChange={(e) => setForm({ ...form, limit_operations: Number(e.target.value) })}
            error={errors.limit_operations}
          />
        </div>
        {createMutation.isError ? (
          <FormAlert>{errorMessageFromUnknown(createMutation.error)}</FormAlert>
        ) : null}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={createMutation.isPending}>
            Create requisite
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function TraderEditRequisiteLimitsModal({
  editingRequisite,
  onClose,
  form,
  setForm,
  updateLimitsMutation,
  onSubmit,
}: {
  editingRequisite: { groupId: string; row: RequisiteApiRow } | null;
  onClose: () => void;
  form: RequisiteFormData;
  setForm: Dispatch<SetStateAction<RequisiteFormData>>;
  updateLimitsMutation: UseMutationResult<
    unknown,
    unknown,
    {
      id: string;
      limits: Pick<
        RequisiteFormData,
        'min_amount' | 'max_amount' | 'limit_amount' | 'limit_operations'
      >;
      acceptsOtherBanks: boolean;
    }
  >;
  onSubmit: () => void;
}) {
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!editingRequisite) setErrors({});
  }, [editingRequisite]);

  return (
    <Modal open={!!editingRequisite} onClose={onClose} title="Edit requisite limits" size="md">
      {editingRequisite && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const parsed = requisiteLimitsSchema.safeParse({
              accepts_other_banks: form.accepts_other_banks,
              min_amount: form.min_amount,
              max_amount: form.max_amount,
              limit_amount: form.limit_amount,
              limit_operations: form.limit_operations,
            });
            if (!parsed.success) {
              setErrors(fieldErrorsFromZod(parsed.error));
              return;
            }
            setErrors({});
            onSubmit();
          }}
          className="space-y-4"
        >
          <div className="rounded-lg bg-bg-secondary p-3">
            <div className="flex items-center gap-2 text-sm">
              <Hash className="h-4 w-4 text-text-muted" />
              <span className="font-mono text-text-secondary">{editingRequisite.row.number}</span>
              <span className="text-text-muted">&middot;</span>
              <span className="text-text-muted">{editingRequisite.row.bank?.name ?? '—'}</span>
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
              error={errors.min_amount}
            />
            <NumberInput
              label="Max amount"
              variant="amount"
              value={form.max_amount}
              onChange={(e) => setForm({ ...form, max_amount: Number(e.target.value) })}
              error={errors.max_amount}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <NumberInput
              label="Volume limit"
              variant="amount"
              value={form.limit_amount}
              onChange={(e) => setForm({ ...form, limit_amount: Number(e.target.value) })}
              error={errors.limit_amount}
            />
            <NumberInput
              label="Operations limit"
              variant="integer"
              value={form.limit_operations}
              onChange={(e) => setForm({ ...form, limit_operations: Number(e.target.value) })}
              error={errors.limit_operations}
            />
          </div>
          {updateLimitsMutation.isError ? (
            <FormAlert>{errorMessageFromUnknown(updateLimitsMutation.error)}</FormAlert>
          ) : null}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={updateLimitsMutation.isPending}>
              Save changes
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

export function TraderRequisiteHistoryModal({
  historyRequisiteId,
  onClose,
  historyLoading,
  items,
}: {
  historyRequisiteId: string | null;
  onClose: () => void;
  historyLoading: boolean;
  items: AuditItem[] | undefined;
}) {
  return (
    <Modal open={!!historyRequisiteId} onClose={onClose} title="Requisite history" size="lg">
      <div className="max-h-[60vh] overflow-y-auto space-y-2">
        {historyLoading ? (
          <p className="text-sm text-text-muted">Loading…</p>
        ) : !items?.length ? (
          <p className="text-sm text-text-muted">No audit entries for this requisite yet.</p>
        ) : (
          items.map((row) => (
            <div
              key={row.id}
              className="rounded-lg border border-border-primary bg-bg-secondary px-3 py-2 text-xs"
            >
              <div className="flex flex-wrap justify-between gap-2 text-text-primary">
                <span className="font-medium">{row.action}</span>
                <span className="text-text-muted">{new Date(row.createdAt).toLocaleString()}</span>
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
  );
}
