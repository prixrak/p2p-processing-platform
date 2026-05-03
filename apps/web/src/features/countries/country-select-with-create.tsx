'use client';

import { useMemo, useState, type ChangeEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { Select, type SelectProps } from '@/components/ui/select';
import { Modal } from '@/components/ui/modal';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { CurrencySelectWithCreate } from '@/features/currencies/currency-select-with-create';
import { api } from '@/lib/api';
import { internalPaths } from '@/lib/internal-api';
import { FormAlert } from '@/components/ui/form-alert';
import { errorMessageFromUnknown } from '@/lib/error-message';
import {
  currencyKeys,
  fetchCurrencyList,
  invalidateCountryListQueries,
  mergeCreatedCountry,
} from '@/lib/query-keys';

export type CountrySelectWithCreateProps = Omit<SelectProps, 'renderListFooter'> & {
  /** When true (default), show "Create country" at the bottom of the list (API allows ADMIN / OWNER only). */
  allowInlineCreate?: boolean;
};

function emitSyntheticChange(
  countryId: string,
  onChange?: SelectProps['onChange'],
): void {
  if (!onChange) return;
  onChange({
    target: { value: countryId },
    currentTarget: { value: countryId },
  } as ChangeEvent<HTMLSelectElement>);
}

export function CountrySelectWithCreate({
  allowInlineCreate = true,
  onChange,
  ...rest
}: CountrySelectWithCreateProps) {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCode, setNewCode] = useState('');
  const [newCurrency, setNewCurrency] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const { data: currencyCatalog = [] } = useQuery({
    queryKey: currencyKeys.list(),
    queryFn: fetchCurrencyList,
    enabled: createOpen,
  });

  const modalCurrencyOptions = useMemo(() => {
    const active = currencyCatalog
      .filter((c) => c.isActive)
      .map((c) => ({ value: c.code, label: c.code }));
    const v = newCurrency.trim().toUpperCase();
    if (v && !active.some((o) => o.value === v)) {
      active.push({ value: v, label: `${v} (inactive)` });
    }
    active.sort((a, b) => a.value.localeCompare(b.value));
    return active;
  }, [currencyCatalog, newCurrency]);

  const createMutation = useMutation({
    mutationFn: async (dto: { name: string; code: string; currency: string }) =>
      api.post<unknown>(internalPaths.adminCountries, {
        name: dto.name.trim(),
        code: dto.code.trim(),
        currency: dto.currency.trim().toUpperCase(),
      }),
    onSuccess: (raw, dto) => {
      invalidateCountryListQueries(queryClient);
      const merged = mergeCreatedCountry(raw, dto);
      const id =
        merged?.id ??
        (typeof raw === 'object' && raw !== null && 'id' in raw
          ? String((raw as { id: unknown }).id)
          : '');
      if (id) emitSyntheticChange(id, onChange);
      setCreateOpen(false);
      setNewName('');
      setNewCode('');
      setNewCurrency('');
      setLocalError(null);
    },
  });

  const submitCreate = () => {
    setLocalError(null);
    const name = newName.trim();
    const code = newCode.trim().toUpperCase();
    const currency = newCurrency.trim().toUpperCase();
    if (name.length < 1) {
      setLocalError('Enter country name.');
      return;
    }
    if (code.length < 2 || code.length > 12) {
      setLocalError('Use a country code between 2 and 12 characters.');
      return;
    }
    if (!/^[A-Z0-9]+$/.test(code)) {
      setLocalError('Country code must be alphanumeric.');
      return;
    }
    if (currency.length < 2 || currency.length > 16 || !/^[A-Z0-9]+$/.test(currency)) {
      setLocalError('Pick or create an active currency (use the dropdown footer first if it is missing).');
      return;
    }
    createMutation.mutate({ name, code, currency });
  };

  const renderFooter = allowInlineCreate
    ? ({ close }: { close: () => void }) => (
        <button
          type="button"
          className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-medium text-accent hover:bg-surface-tertiary"
          onClick={() => {
            close();
            setNewName('');
            setNewCode('');
            setNewCurrency('');
            setLocalError(null);
            createMutation.reset();
            setCreateOpen(true);
          }}
        >
          <Plus className="h-4 w-4 shrink-0" strokeWidth={2.5} />
          Create country
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
            setNewName('');
            setNewCode('');
            setNewCurrency('');
            setLocalError(null);
            createMutation.reset();
          }
        }}
        title="New country"
      >
        <div className="space-y-4">
          <Input
            label="Name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Ukraine"
            required
          />
          <Input
            label="Code (ISO 3166-1)"
            value={newCode}
            onChange={(e) => setNewCode(e.target.value.toUpperCase())}
            placeholder="UA"
            maxLength={12}
            required
          />
          <CurrencySelectWithCreate
            label="Market currency"
            placeholder="Select currency"
            required
            options={modalCurrencyOptions}
            value={newCurrency}
            onChange={(e) => setNewCurrency(e.target.value)}
          />
          <p className="text-xs text-text-muted">
            Countries must reference an existing active currency row. Add one from this currency dropdown
            (footer) before saving if needed.
          </p>
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
                setNewName('');
                setNewCode('');
                setNewCurrency('');
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
