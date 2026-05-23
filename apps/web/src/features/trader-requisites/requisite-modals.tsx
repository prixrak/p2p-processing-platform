'use client';

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { Hash } from 'lucide-react';
import { useTranslations } from 'next-intl';
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
import { formatDateTime } from '@/lib/utils';
import { parseDecimalInput } from '@/lib/decimal-input';
import {
  humanizeFieldKey,
  formatAuditFieldValue,
  sanitizeAuditSnapshotForDisplay,
  listAuditFieldChanges,
} from '@/lib/audit-display';
import {
  formatCardNumberInput,
  formatIbanInput,
  requisiteCaretAfterSignificant,
  requisiteSignificantBeforeCaret,
} from './utils';

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
  const t = useTranslations('Trader.Requisites.modals');
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) setErrors({});
  }, [open]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('addGroup.title')}
      size="md"
      closeOnBackdropClick={false}
    >
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
          label={t('addGroup.nameLabel')}
          placeholder={t('addGroup.namePlaceholder')}
          value={groupForm.name}
          onChange={(e) => setGroupForm({ ...groupForm, name: e.target.value })}
          error={errors.name}
        />
        <Select
          label={t('addGroup.currencyLabel')}
          options={currencyOptions.length ? currencyOptions : [{ value: 'UAH', label: 'UAH' }]}
          value={groupForm.currency}
          onChange={(e) =>
            setGroupForm((prev) => ({
              ...prev,
              currency: e.target.value,
              payment_method_id: '',
            }))
          }
          error={errors.currency}
        />
        <Select
          label={t('addGroup.paymentMethodLabel')}
          placeholder={pmOptions.length ? t('addGroup.paymentMethodPlaceholder') : undefined}
          options={pmOptions}
          value={groupForm.payment_method_id}
          onChange={(e) => setGroupForm({ ...groupForm, payment_method_id: e.target.value })}
          error={errors.payment_method_id}
          required
        />
        {!pmOptions.length ? (
          <p className="text-sm text-text-muted">{t('addGroup.noPaymentMethods')}</p>
        ) : null}
        {createGroupMutation.isError ? (
          <FormAlert>{errorMessageFromUnknown(createGroupMutation.error)}</FormAlert>
        ) : null}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button type="submit" loading={createGroupMutation.isPending}>
            {t('addGroup.submit')}
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
      body: { name?: string; isActive?: boolean; paymentMethodId?: string };
    }
  >;
  onSubmit: () => void;
}) {
  const t = useTranslations('Trader.Requisites.modals');
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!editingGroup) setErrors({});
  }, [editingGroup]);

  return (
    <Modal
      open={!!editingGroup}
      onClose={onClose}
      title={t('editGroup.title')}
      size="md"
      closeOnBackdropClick={false}
    >
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
            label={t('editGroup.nameLabel')}
            value={groupEditForm.name}
            onChange={(e) => setGroupEditForm({ ...groupEditForm, name: e.target.value })}
            error={errors.name}
          />
          <Select
            label={t('editGroup.paymentMethodLabel')}
            placeholder={pmOptions.length ? t('editGroup.paymentMethodPlaceholder') : undefined}
            options={pmOptions}
            value={groupEditForm.payment_method_id}
            onChange={(e) =>
              setGroupEditForm({ ...groupEditForm, payment_method_id: e.target.value })
            }
            error={errors.payment_method_id}
            required
          />
          {!pmOptions.length ? (
            <p className="text-sm text-text-muted">{t('editGroup.noPaymentMethods')}</p>
          ) : null}
          {updateGroupMutation.isError ? (
            <FormAlert>{errorMessageFromUnknown(updateGroupMutation.error)}</FormAlert>
          ) : null}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              {t('cancel')}
            </Button>
            <Button type="submit" loading={updateGroupMutation.isPending}>
              {t('save')}
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
  const t = useTranslations('Trader.Requisites.modals');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const requisiteNumberInputRef = useRef<HTMLInputElement>(null);
  const requisiteNumberCaretRef = useRef<number | null>(null);

  useEffect(() => {
    if (!addRequisiteGroupId) setErrors({});
  }, [addRequisiteGroupId]);

  useLayoutEffect(() => {
    const el = requisiteNumberInputRef.current;
    const pos = requisiteNumberCaretRef.current;
    if (el && pos != null) {
      const clamped = Math.min(pos, el.value.length);
      el.setSelectionRange(clamped, clamped);
      requisiteNumberCaretRef.current = null;
    }
  }, [form.number]);

  function handleRequisiteNumberChange(e: ChangeEvent<HTMLInputElement>) {
    const el = e.target;
    const mode = form.type === RequisiteType.CARD ? 'card' : 'iban';
    const sig = requisiteSignificantBeforeCaret(el.value, el.selectionStart, mode);
    const next =
      mode === 'card' ? formatCardNumberInput(el.value) : formatIbanInput(el.value);
    requisiteNumberCaretRef.current = requisiteCaretAfterSignificant(next, sig, mode);
    setForm({ ...form, number: next });
  }

  return (
    <Modal
      open={!!addRequisiteGroupId}
      onClose={onClose}
      title={t('addRequisite.title')}
      size="md"
      closeOnBackdropClick={false}
    >
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
          label={t('addRequisite.typeLabel')}
          options={[
            { value: RequisiteType.CARD, label: t('addRequisite.typeCard') },
            { value: RequisiteType.IBAN, label: t('addRequisite.typeIban') },
          ]}
          value={form.type}
          onChange={(e) => {
            const newType = e.target.value as RequisiteType;
            setForm((prev) => ({
              ...prev,
              type: newType,
              number:
                newType === RequisiteType.CARD
                  ? formatCardNumberInput(prev.number)
                  : formatIbanInput(prev.number),
            }));
            setErrors((prev) => {
              const next = { ...prev };
              delete next.number;
              return next;
            });
          }}
          error={errors.type}
        />
        <Input
          ref={requisiteNumberInputRef}
          label={
            form.type === RequisiteType.CARD
              ? t('addRequisite.cardNumberLabel')
              : t('addRequisite.ibanLabel')
          }
          placeholder={
            form.type === RequisiteType.CARD
              ? t('addRequisite.cardNumberPlaceholder')
              : t('addRequisite.ibanPlaceholder')
          }
          className="font-mono tabular-nums tracking-wide"
          inputMode={form.type === RequisiteType.CARD ? 'numeric' : 'text'}
          autoComplete="off"
          spellCheck={false}
          value={form.number}
          onChange={handleRequisiteNumberChange}
          error={errors.number}
        />
        <Input
          label={t('addRequisite.ownerNameLabel')}
          placeholder={t('addRequisite.ownerNamePlaceholder')}
          value={form.owner}
          onChange={(e) => setForm({ ...form, owner: e.target.value })}
          error={errors.owner}
        />
        <Input
          label={t('addRequisite.cardHolderNameLabel')}
          placeholder={t('addRequisite.cardHolderNamePlaceholder')}
          value={form.card_holder_name}
          onChange={(e) => setForm({ ...form, card_holder_name: e.target.value })}
          error={errors.card_holder_name}
        />
        <Select
          label={t('addRequisite.bankLabel')}
          placeholder={bankOptions.length ? t('addRequisite.bankPlaceholder') : undefined}
          options={bankOptions}
          value={form.bank_id}
          onChange={(e) => setForm({ ...form, bank_id: e.target.value })}
          error={errors.bank_id}
          required
        />
        {!bankOptions.length ? (
          <p className="text-sm text-text-muted">{t('addRequisite.noBanks')}</p>
        ) : null}
        <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
          <input
            type="checkbox"
            className="rounded border-border-primary"
            checked={form.accepts_other_banks}
            onChange={(e) => setForm({ ...form, accepts_other_banks: e.target.checked })}
          />
          {t('addRequisite.acceptOtherBanks')}
        </label>
        <div className="grid grid-cols-2 gap-4">
          <NumberInput
            label={t('addRequisite.minAmountLabel')}
            variant="amount"
            value={form.min_amount}
            onChange={(e) => setForm({ ...form, min_amount: parseDecimalInput(e.target.value) || 0 })}
            error={errors.min_amount}
          />
          <NumberInput
            label={t('addRequisite.maxAmountLabel')}
            variant="amount"
            value={form.max_amount}
            onChange={(e) => setForm({ ...form, max_amount: parseDecimalInput(e.target.value) || 0 })}
            error={errors.max_amount}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <NumberInput
            label={t('addRequisite.volumeLimitLabel')}
            variant="amount"
            value={form.limit_amount}
            onChange={(e) => setForm({ ...form, limit_amount: parseDecimalInput(e.target.value) || 0 })}
            error={errors.limit_amount}
          />
          <NumberInput
            label={t('addRequisite.operationsLimitLabel')}
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
            {t('cancel')}
          </Button>
          <Button type="submit" loading={createMutation.isPending}>
            {t('addRequisite.submit')}
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
  const t = useTranslations('Trader.Requisites.modals');
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!editingRequisite) setErrors({});
  }, [editingRequisite]);

  return (
    <Modal
      open={!!editingRequisite}
      onClose={onClose}
      title={t('editLimits.title')}
      size="md"
      closeOnBackdropClick={false}
    >
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
            {t('editLimits.acceptOtherBanks')}
          </label>
          <div className="grid grid-cols-2 gap-4">
            <NumberInput
              label={t('editLimits.minAmountLabel')}
              variant="amount"
              value={form.min_amount}
              onChange={(e) => setForm({ ...form, min_amount: parseDecimalInput(e.target.value) || 0 })}
              error={errors.min_amount}
            />
            <NumberInput
              label={t('editLimits.maxAmountLabel')}
              variant="amount"
              value={form.max_amount}
              onChange={(e) => setForm({ ...form, max_amount: parseDecimalInput(e.target.value) || 0 })}
              error={errors.max_amount}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <NumberInput
              label={t('editLimits.volumeLimitLabel')}
              variant="amount"
              value={form.limit_amount}
              onChange={(e) => setForm({ ...form, limit_amount: parseDecimalInput(e.target.value) || 0 })}
              error={errors.limit_amount}
            />
            <NumberInput
              label={t('editLimits.operationsLimitLabel')}
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
              {t('cancel')}
            </Button>
            <Button type="submit" loading={updateLimitsMutation.isPending}>
              {t('saveChanges')}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

function RequisiteAuditSnapshots({ oldRaw, newRaw }: { oldRaw: unknown; newRaw: unknown }) {
  const t = useTranslations('Trader.Requisites.modals.history');
  const oldRec = sanitizeAuditSnapshotForDisplay(oldRaw);
  const newRec = sanitizeAuditSnapshotForDisplay(newRaw);
  const changes = listAuditFieldChanges(oldRec, newRec);

  if (changes.length > 0) {
    return (
      <div className="mt-2 space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
          {t('changedFields')}
        </p>
        <div className="space-y-2">
          {changes.map((c) => (
            <div
              key={c.field}
              className="rounded-md border border-border-primary/70 bg-bg-primary/30 px-2 py-2"
            >
              <p className="text-[11px] text-text-muted">{c.label}</p>
              <div className="mt-1 grid gap-2 sm:grid-cols-2">
                <div>
                  <span className="text-[10px] uppercase text-text-muted">{t('before')}</span>
                  <p className="break-words text-text-secondary">{c.before}</p>
                </div>
                <div>
                  <span className="text-[10px] uppercase text-text-muted">{t('after')}</span>
                  <p className="break-words text-text-primary">{c.after}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (oldRec || newRec) {
    return (
      <div className="mt-2 grid gap-4 md:grid-cols-2">
        {oldRec ? (
          <div>
            <p className="mb-2 text-[11px] font-semibold text-text-muted">{t('previousState')}</p>
            <dl className="max-h-52 space-y-2 overflow-y-auto pr-1 text-xs">
              {Object.entries(oldRec)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([key, val]) => (
                  <div key={key}>
                    <dt className="text-text-muted">{humanizeFieldKey(key)}</dt>
                    <dd className="break-words text-text-primary">{formatAuditFieldValue(val)}</dd>
                  </div>
                ))}
            </dl>
          </div>
        ) : null}
        {newRec ? (
          <div>
            <p className="mb-2 text-[11px] font-semibold text-text-muted">{t('newState')}</p>
            <dl className="max-h-52 space-y-2 overflow-y-auto pr-1 text-xs">
              {Object.entries(newRec)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([key, val]) => (
                  <div key={key}>
                    <dt className="text-text-muted">{humanizeFieldKey(key)}</dt>
                    <dd className="break-words text-text-primary">{formatAuditFieldValue(val)}</dd>
                  </div>
                ))}
            </dl>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <p className="mt-2 text-text-muted">{t('noSnapshots')}</p>
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
  const t = useTranslations('Trader.Requisites.modals.history');

  return (
    <Modal
      open={!!historyRequisiteId}
      onClose={onClose}
      title={t('title')}
      subtitle={historyRequisiteId ? t('subtitle', { id: historyRequisiteId }) : undefined}
      size="xl"
      closeOnBackdropClick={false}
    >
      <div className="max-h-[min(70vh,720px)] overflow-y-auto space-y-3">
        {historyLoading ? (
          <p className="text-sm text-text-muted">{t('loading')}</p>
        ) : !items?.length ? (
          <p className="text-sm text-text-muted">{t('empty')}</p>
        ) : (
          items.map((row) => (
            <div
              key={row.id}
              className="rounded-lg border border-border-primary bg-bg-secondary px-3 py-3 text-xs"
            >
              <div className="flex flex-wrap justify-between gap-2 text-text-primary">
                <span className="font-medium">{row.action}</span>
                <span className="font-mono tabular-nums text-text-muted">
                  {formatDateTime(new Date(row.createdAt))}
                </span>
              </div>
              <p className="mt-1 text-text-muted">
                {row.actor ? `${row.actor.email} (${row.actor.role})` : t('actorNotRecorded')}
              </p>
              <RequisiteAuditSnapshots oldRaw={row.oldValue} newRaw={row.newValue} />
            </div>
          ))
        )}
      </div>
    </Modal>
  );
}
