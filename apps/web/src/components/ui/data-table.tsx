'use client';

import { useState, type ReactNode } from 'react';
import { clsx } from 'clsx';
import { ChevronDown, ChevronLeft, ChevronRight as ChevronRightIcon } from 'lucide-react';

interface Column<T> {
  key: string;
  header: string;
  render?: (row: T) => ReactNode;
  className?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  isLoading?: boolean;
  emptyMessage?: string;
  page?: number;
  totalPages?: number;
  onPageChange?: (page: number) => void;
  keyExtractor?: (row: T) => string;
  expandable?: (row: T) => ReactNode;
  onRowClick?: (row: T) => void;
  className?: string;
}

export function DataTable<T>({
  columns,
  data,
  isLoading,
  emptyMessage = 'No data found',
  page,
  totalPages,
  onPageChange,
  keyExtractor,
  expandable,
  onRowClick,
  className,
}: DataTableProps<T>) {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const toggleRow = (key: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const getKey = (row: T, index: number): string => {
    if (keyExtractor) return keyExtractor(row);
    const rec = row as Record<string, unknown>;
    if (rec.id) return String(rec.id);
    return String(index);
  };

  if (isLoading) {
    return (
      <div className={clsx('bg-bg-card border border-border-primary rounded-xl overflow-hidden', className)}>
        <div className="p-12 text-center">
          <div className="inline-block w-6 h-6 border-2 border-accent-blue border-t-transparent rounded-full animate-spin" />
          <p className="mt-3 text-sm text-text-muted">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={clsx('space-y-4', className)}>
      <div className="bg-bg-card border border-border-primary rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-primary">
                {expandable && <th className="w-10" />}
                {columns.map((col) => (
                  <th
                    key={col.key}
                    className={clsx(
                      'px-4 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider',
                      col.className,
                    )}
                  >
                    {col.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border-primary">
              {data.length === 0 ? (
                <tr>
                  <td
                    colSpan={columns.length + (expandable ? 1 : 0)}
                    className="px-4 py-12 text-center text-text-muted"
                  >
                    {emptyMessage}
                  </td>
                </tr>
              ) : (
                data.map((row, i) => {
                  const key = getKey(row, i);
                  const isExpanded = expandedRows.has(key);

                  return (
                    <TableRow
                      key={key}
                      row={row}
                      columns={columns}
                      expandable={expandable}
                      isExpanded={isExpanded}
                      onToggle={() => toggleRow(key)}
                      onRowClick={onRowClick}
                    />
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {page !== undefined && totalPages !== undefined && totalPages > 1 && onPageChange && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-text-muted">
            Page {page} of {totalPages}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1}
              className="inline-flex items-center gap-1 rounded-lg border border-border-primary bg-bg-secondary px-3 py-1.5 text-sm text-text-secondary transition-colors hover:bg-bg-hover disabled:opacity-50 disabled:pointer-events-none"
            >
              <ChevronLeft className="h-4 w-4" /> Previous
            </button>
            <button
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages}
              className="inline-flex items-center gap-1 rounded-lg border border-border-primary bg-bg-secondary px-3 py-1.5 text-sm text-text-secondary transition-colors hover:bg-bg-hover disabled:opacity-50 disabled:pointer-events-none"
            >
              Next <ChevronRightIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function TableRow<T>({
  row,
  columns,
  expandable,
  isExpanded,
  onToggle,
  onRowClick,
}: {
  row: T;
  columns: Column<T>[];
  expandable?: (row: T) => ReactNode;
  isExpanded: boolean;
  onToggle: () => void;
  onRowClick?: (row: T) => void;
}) {
  return (
    <>
      <tr
        className={clsx(
          'bg-bg-card transition-colors hover:bg-bg-hover/50',
          onRowClick && 'cursor-pointer',
        )}
        onClick={() => onRowClick?.(row)}
      >
        {expandable && (
          <td className="px-2 py-3">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggle();
              }}
              className="p-1 rounded text-text-muted hover:text-text-primary"
            >
              <ChevronDown
                size={14}
                className={clsx(
                  'transition-transform',
                  !isExpanded && '-rotate-90',
                )}
              />
            </button>
          </td>
        )}
        {columns.map((col) => (
          <td
            key={col.key}
            className={clsx('px-4 py-3 text-text-primary', col.className)}
          >
            {col.render
              ? col.render(row)
              : String((row as Record<string, unknown>)[col.key] ?? '')}
          </td>
        ))}
      </tr>
      {expandable && isExpanded && (
        <tr>
          <td colSpan={columns.length + 1} className="bg-bg-tertiary/50 px-6 py-4">
            {expandable(row)}
          </td>
        </tr>
      )}
    </>
  );
}
