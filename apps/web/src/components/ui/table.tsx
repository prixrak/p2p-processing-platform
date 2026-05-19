'use client';

import { cn } from '@/lib/utils';
import {
  DefaultMobileTableCard,
  MobileTableCardList,
  type TableColumn,
} from '@/components/ui/mobile-table-cards';

export type { TableColumn };

interface TableProps<T> {
  columns: TableColumn<T>[];
  data: T[];
  onRowClick?: (row: T) => void;
  keyExtractor: (row: T) => string;
  emptyMessage?: string;
  loading?: boolean;
  /** Desktop table on md+; cards below md. Set `scroll` to keep horizontal scroll on mobile. */
  mobileLayout?: 'cards' | 'scroll';
  mobileCardRender?: (row: T) => React.ReactNode;
}

export function Table<T>({
  columns,
  data,
  onRowClick,
  keyExtractor,
  emptyMessage = 'No data',
  loading,
  mobileLayout = 'cards',
  mobileCardRender,
}: TableProps<T>) {
  const useMobileCards = mobileLayout === 'cards';

  return (
    <>
      {useMobileCards ? (
        <MobileTableCardList
          data={data}
          keyExtractor={(row, index) => keyExtractor(row)}
          loading={loading}
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
          'overflow-x-auto rounded-xl border border-border-primary',
          useMobileCards && 'hidden md:block',
        )}
      >
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-primary bg-bg-secondary">
              {columns.map((col) => {
                const actionsColumn = col.key === 'actions';
                return (
                  <th
                    key={col.key}
                    className={cn(
                      'align-middle px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-muted',
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
            {loading ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-12 text-center text-text-muted">
                  <div className="flex items-center justify-center gap-2">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-accent-blue border-t-transparent" />
                    Loading...
                  </div>
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-12 text-center text-text-muted">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              data.map((row) => (
                <tr
                  key={keyExtractor(row)}
                  onClick={() => onRowClick?.(row)}
                  className={cn(
                    'bg-bg-card transition-colors',
                    onRowClick && 'cursor-pointer hover:bg-bg-hover',
                  )}
                >
                  {columns.map((col) => {
                    const actionsColumn = col.key === 'actions';
                    return (
                      <td
                        key={col.key}
                        className={cn(
                          'align-middle px-4 py-3 text-text-primary',
                          actionsColumn &&
                            'text-end [&>*]:flex [&>*]:flex-nowrap [&>*]:items-center [&>*]:justify-end',
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
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
