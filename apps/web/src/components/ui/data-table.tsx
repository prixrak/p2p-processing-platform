'use client';

import { useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { Tooltip } from '@/components/ui/tooltip';
import { PaginationControls } from '@/components/ui/pagination-controls';
import {
  DefaultMobileTableCard,
  MobileTableCardList,
  type TableColumn,
} from '@/components/ui/mobile-table-cards';
import { cn } from '@/lib/utils';

export type DataTableColumn<T> = TableColumn<T>;

interface DataTableProps<T> {
  columns: TableColumn<T>[];
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
  mobileLayout?: 'cards' | 'scroll';
  mobileCardRender?: (row: T) => ReactNode;
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
  mobileLayout = 'cards',
  mobileCardRender,
}: DataTableProps<T>) {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const useMobileCards = mobileLayout === 'cards' && !expandable;

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
      <div className={cn('bg-bg-card border border-border-primary rounded-xl overflow-hidden', className)}>
        <div className="p-12 text-center">
          <div className="inline-block w-6 h-6 border-2 border-accent-blue border-t-transparent rounded-full animate-spin" />
          <p className="mt-3 text-sm text-text-muted">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('space-y-4', className)}>
      {useMobileCards ? (
        <MobileTableCardList
          data={data}
          keyExtractor={(row, index) => getKey(row, index)}
          emptyMessage={emptyMessage}
          onRowClick={onRowClick}
          renderCard={
            mobileCardRender ??
            ((row) => <DefaultMobileTableCard row={row} columns={columns} />)
          }
        />
      ) : null}

      <div
        className={cn(
          'bg-bg-card border border-border-primary rounded-xl overflow-x-auto',
          useMobileCards && 'hidden md:block',
        )}
      >
        <div className="min-w-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-primary bg-bg-secondary">
                {expandable && <th className="w-10 align-middle" />}
                {columns.map((col) => {
                  const actionsColumn = col.key === 'actions';
                  return (
                    <th
                      key={col.key}
                      className={cn(
                        'align-middle px-4 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider',
                        actionsColumn && 'text-end',
                        col.className,
                      )}
                    >
                      {col.header}
                    </th>
                  );
                })}
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

      {page !== undefined && totalPages !== undefined && onPageChange && (
        <PaginationControls page={page} totalPages={totalPages} onPageChange={onPageChange} />
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
  columns: TableColumn<T>[];
  expandable?: (row: T) => ReactNode;
  isExpanded: boolean;
  onToggle: () => void;
  onRowClick?: (row: T) => void;
}) {
  return (
    <>
      <tr
        className={cn(
          'bg-bg-card transition-colors hover:bg-bg-hover/50',
          onRowClick && 'cursor-pointer',
        )}
        onClick={() => onRowClick?.(row)}
      >
        {expandable && (
          <td className="align-middle px-2 py-3">
            <Tooltip content={isExpanded ? 'Collapse row' : 'Expand row'} side="top">
              <span className="inline-flex">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggle();
                  }}
                  aria-expanded={isExpanded}
                  aria-label={isExpanded ? 'Collapse row' : 'Expand row'}
                  className="cursor-pointer rounded p-1 text-text-muted transition-colors hover:bg-surface-tertiary hover:text-text-primary"
                >
                  <ChevronDown
                    size={14}
                    className={cn(
                      'transition-transform',
                      !isExpanded && '-rotate-90',
                    )}
                  />
                </button>
              </span>
            </Tooltip>
          </td>
        )}
        {columns.map((col) => {
          const actionsColumn = col.key === 'actions';
          return (
            <td
              key={col.key}
              className={cn(
                'align-middle px-4 py-3 text-text-primary',
                actionsColumn &&
                  'text-end [&>*]:flex [&>*]:flex-wrap [&>*]:justify-end',
                col.className,
              )}
            >
              {col.render
                ? col.render(row)
                : String((row as Record<string, unknown>)[col.key] ?? '')}
            </td>
          );
        })}
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
