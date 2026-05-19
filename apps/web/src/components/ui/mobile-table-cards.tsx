'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface TableColumn<T> {
  key: string;
  header: string;
  className?: string;
  render?: (row: T) => ReactNode;
  /** When set, shown in the card header row on mobile (max 2). */
  mobilePrimary?: boolean;
  /** Omit from the mobile card body. */
  hideOnMobile?: boolean;
}

function renderCell<T>(row: T, col: TableColumn<T>): ReactNode {
  if (col.render) return col.render(row);
  return String((row as Record<string, unknown>)[col.key] ?? '—');
}

export function DefaultMobileTableCard<T>({
  row,
  columns,
}: {
  row: T;
  columns: TableColumn<T>[];
}) {
  const actionsCol = columns.find((c) => c.key === 'actions');
  const visible = columns.filter((c) => c.key !== 'actions' && !c.hideOnMobile);
  const primaryCols = visible.filter((c) => c.mobilePrimary);
  const headerCols =
    primaryCols.length > 0 ? primaryCols.slice(0, 2) : visible.slice(0, 1);
  const bodyCols = visible.filter((c) => !headerCols.includes(c));

  return (
    <div className="space-y-3">
      {headerCols.length > 0 ? (
        <div className="flex flex-wrap items-start justify-between gap-2">
          {headerCols.map((col) => (
            <div key={col.key} className="min-w-0">
              <p className="text-[10px] font-medium uppercase tracking-wide text-text-muted">
                {col.header}
              </p>
              <div className="mt-0.5 text-sm font-semibold text-text-primary">{renderCell(row, col)}</div>
            </div>
          ))}
        </div>
      ) : null}

      {bodyCols.length > 0 ? (
        <dl className="grid grid-cols-1 gap-2.5 border-t border-border-primary/60 pt-3 sm:grid-cols-2">
          {bodyCols.map((col) => (
            <div key={col.key} className="min-w-0">
              <dt className="text-[10px] font-medium uppercase tracking-wide text-text-muted">
                {col.header}
              </dt>
              <dd className="mt-0.5 text-sm text-text-primary break-words">{renderCell(row, col)}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {actionsCol ? (
        <div
          className="flex flex-wrap items-center justify-stretch gap-2 border-t border-border-primary/60 pt-3 [&_button]:min-h-11"
          onClick={(e) => e.stopPropagation()}
        >
          {renderCell(row, actionsCol)}
        </div>
      ) : null}
    </div>
  );
}

interface MobileTableCardListProps<T> {
  data: T[];
  keyExtractor: (row: T, index: number) => string;
  renderCard: (row: T) => ReactNode;
  emptyMessage?: string;
  loading?: boolean;
  onRowClick?: (row: T) => void;
  className?: string;
}

export function MobileTableCardList<T>({
  data,
  keyExtractor,
  renderCard,
  emptyMessage = 'No data',
  loading,
  onRowClick,
  className,
}: MobileTableCardListProps<T>) {
  if (loading) {
    return (
      <div
        className={cn(
          'rounded-xl border border-border-primary bg-bg-card p-10 text-center md:hidden',
          className,
        )}
      >
        <div className="mx-auto flex items-center justify-center gap-2 text-sm text-text-muted">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-accent-blue border-t-transparent" />
          Loading...
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div
        className={cn(
          'rounded-xl border border-border-primary bg-bg-card p-10 text-center text-sm text-text-muted md:hidden',
          className,
        )}
      >
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className={cn('space-y-3 md:hidden', className)}>
      {data.map((row, index) => (
        <div
          key={keyExtractor(row, index)}
          role={onRowClick ? 'button' : undefined}
          tabIndex={onRowClick ? 0 : undefined}
          onClick={() => onRowClick?.(row)}
          onKeyDown={(e) => {
            if (!onRowClick) return;
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onRowClick(row);
            }
          }}
          className={cn(
            'rounded-xl border border-border-primary bg-bg-card p-4 shadow-sm transition-colors',
            onRowClick && 'cursor-pointer hover:bg-bg-hover/50 active:bg-bg-hover/80',
          )}
        >
          {renderCard(row)}
        </div>
      ))}
    </div>
  );
}
