'use client';

import { Input } from '@/components/ui/input';

export function CascadeCoverageSection({
  currency,
  setCurrency,
  nominals,
}: {
  currency: string;
  setCurrency: (v: string) => void;
  nominals: { nominal: number; count: number }[] | undefined;
}) {
  return (
    <section className="rounded-xl border border-border-primary bg-surface-secondary p-5">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="text-xs text-text-muted">Coverage currency</label>
          <Input
            className="mt-1 w-28"
            value={currency}
            onChange={(e) => setCurrency(e.target.value.toUpperCase())}
          />
        </div>
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
