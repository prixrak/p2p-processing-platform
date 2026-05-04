'use client';

import type { SelectOption } from '@/components/ui/select';
import { Select } from '@/components/ui/select';

export function CascadeCoverageSection({
  currency,
  setCurrency,
  currencyOptions,
  currenciesLoading,
  nominals,
}: {
  currency: string;
  setCurrency: (v: string) => void;
  currencyOptions: SelectOption[];
  currenciesLoading: boolean;
  nominals: { nominal: number; count: number }[] | undefined;
}) {
  const disabled = currencyOptions.length === 0;

  return (
    <section className="rounded-xl border border-border-primary bg-surface-secondary p-5">
      <div className="flex flex-wrap items-end gap-3">
        <Select
          label="Coverage currency"
          labelClassName="text-xs font-normal text-text-muted"
          rootClassName="w-auto min-w-0"
          className="min-w-[8.5rem]"
          options={currencyOptions}
          value={currency}
          onChange={(e) => setCurrency(e.target.value)}
          disabled={disabled}
          placeholder={currenciesLoading ? 'Loading…' : 'No currencies'}
        />
      </div>
      {nominals && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border-primary text-text-muted">
                <th className="py-2 pr-4">Nominal</th>
                <th className="py-2">Requisites</th>
              </tr>
            </thead>
            <tbody>
              {nominals.map((row) => (
                <tr key={row.nominal} className="border-b border-border-primary/60">
                  <td className="py-2 pr-4 font-medium">{row.nominal}</td>
                  <td className="py-2">{row.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
