'use client';

import { Plus, Trash2, Power, PowerOff } from 'lucide-react';
import { IconButton } from '@/components/ui/icon-button';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { NominalRow } from './cascade-types';

export function CascadeNominalGridSection({
  readOnly,
  rows,
  newAmount,
  setNewAmount,
  newSort,
  setNewSort,
  onAddNominal,
  addPending,
  onToggleActive,
  onDelete,
}: {
  readOnly: boolean;
  rows: NominalRow[];
  newAmount: string;
  setNewAmount: (v: string) => void;
  newSort: string;
  setNewSort: (v: string) => void;
  onAddNominal: () => void;
  addPending: boolean;
  onToggleActive: (id: string, isActive: boolean) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <section className="rounded-xl border border-border-primary bg-surface-secondary p-5">
      <h2 className="text-sm font-medium text-text-secondary">Nominal grid</h2>
      <p className="mt-1 text-xs text-text-muted">
        Fork auto_max hole detection uses this list. Changes invalidate Redis coverage keys.
      </p>

      {!readOnly && (
        <div className="mt-4 flex flex-wrap items-end gap-2">
          <Input
            placeholder="Amount"
            type="text"
            inputMode="decimal"
            className="w-32"
            value={newAmount}
            onChange={(e) => setNewAmount(e.target.value)}
          />
          <Input
            placeholder="Sort order (optional)"
            type="number"
            className="w-40"
            value={newSort}
            onChange={(e) => setNewSort(e.target.value)}
          />
          <Button
            type="button"
            size="sm"
            disabled={addPending || newAmount.trim() === ''}
            onClick={onAddNominal}
          >
            <Plus className="mr-1 h-4 w-4" />
            Add nominal
          </Button>
        </div>
      )}

      <div className="mt-6 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border-primary text-text-muted">
              <th className="py-2 pr-4">Amount</th>
              <th className="py-2 pr-4">Sort</th>
              <th className="py-2 pr-4">Active</th>
              {!readOnly && (
                <th className="py-2 text-end align-middle text-xs font-medium uppercase tracking-wider text-text-muted">
                  Actions
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-border-primary/60">
                <td className="py-2 pr-4 font-medium">{row.amount}</td>
                <td className="py-2 pr-4">{row.sort_order}</td>
                <td className="py-2 pr-4">{row.is_active ? 'Yes' : 'No'}</td>
                {!readOnly && (
                  <td className="py-2 text-end align-middle">
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <IconButton
                        label={row.is_active ? 'Deactivate nominal' : 'Activate nominal'}
                        variant={row.is_active ? 'danger' : 'success'}
                        onClick={() => onToggleActive(row.id, !row.is_active)}
                      >
                        {row.is_active ? (
                          <PowerOff className="h-4 w-4" />
                        ) : (
                          <Power className="h-4 w-4" />
                        )}
                      </IconButton>
                      <IconButton
                        label="Delete nominal"
                        variant="danger"
                        onClick={() => {
                          if (confirm('Delete this nominal?')) onDelete(row.id);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </IconButton>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
