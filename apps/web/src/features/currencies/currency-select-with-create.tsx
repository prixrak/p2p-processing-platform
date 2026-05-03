'use client';

import { useState, type ChangeEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { Select, type SelectProps } from '@/components/ui/select';
import { Modal } from '@/components/ui/modal';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { internalPaths } from '@/lib/internal-api';
import { FormAlert } from '@/components/ui/form-alert';
import { errorMessageFromUnknown } from '@/lib/error-message';
import {
  invalidateCurrencyListQueries,
  type CurrencyListItem,
} from '@/lib/query-keys';

export type CurrencySelectWithCreateProps = Omit<SelectProps, 'renderListFooter'> & {
  /** When true (default), show "Create currency" at the bottom of the list (API allows ADMIN / OWNER only). */
  allowInlineCreate?: boolean;
};

function emitSyntheticChange(
  code: string,
  onChange?: SelectProps['onChange'],
): void {
  if (!onChange) return;
  onChange({
    target: { value: code },
    currentTarget: { value: code },
  } as ChangeEvent<HTMLSelectElement>);
}

export function CurrencySelectWithCreate({
  allowInlineCreate = true,
  onChange,
  ...rest
}: CurrencySelectWithCreateProps) {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [newCode, setNewCode] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: async (code: string) =>
      api.post<CurrencyListItem>(internalPaths.currencies, {
        code: code.trim(),
      }),
    onSuccess: (row) => {
      invalidateCurrencyListQueries(queryClient);
      emitSyntheticChange(row.code.trim().toUpperCase(), onChange);
      setCreateOpen(false);
      setNewCode('');
      setLocalError(null);
    },
  });

  const submitCreate = () => {
    setLocalError(null);
    const code = newCode.trim().toUpperCase();
    if (code.length < 2 || code.length > 16) {
      setLocalError('Use 2–16 alphanumeric characters.');
      return;
    }
    if (!/^[A-Za-z0-9]+$/.test(code)) {
      setLocalError('Currency code must be alphanumeric.');
      return;
    }
    createMutation.mutate(code);
  };

  const renderFooter = allowInlineCreate
    ? ({ close }: { close: () => void }) => (
        <button
          type="button"
          className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-medium text-accent hover:bg-surface-tertiary"
          onClick={() => {
            close();
            setNewCode('');
            setLocalError(null);
            createMutation.reset();
            setCreateOpen(true);
          }}
        >
          <Plus className="h-4 w-4 shrink-0" strokeWidth={2.5} />
          Create currency
        </button>
      )
    : undefined;

  return (
    <>
      <Select {...rest} onChange={onChange} renderListFooter={renderFooter} />
      <Modal
        open={createOpen}
        onClose={() => {
          if (!createMutation.isPending) {
            setCreateOpen(false);
            setNewCode('');
            setLocalError(null);
          }
        }}
        title="New currency"
      >
        <div className="space-y-4">
          <Input
            label="Code"
            value={newCode}
            onChange={(e) => setNewCode(e.target.value.toUpperCase())}
            placeholder="EUR"
            maxLength={16}
            autoComplete="off"
          />
          {localError ? <FormAlert>{localError}</FormAlert> : null}
          {createMutation.isError ? (
            <FormAlert>{errorMessageFromUnknown(createMutation.error)}</FormAlert>
          ) : null}
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              disabled={createMutation.isPending}
              onClick={() => {
                setCreateOpen(false);
                setNewCode('');
                setLocalError(null);
                createMutation.reset();
              }}
            >
              Cancel
            </Button>
            <Button type="button" loading={createMutation.isPending} onClick={submitCreate}>
              Create
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
