'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Select } from '@/components/ui/select';
import { Tooltip } from '@/components/ui/tooltip';
import { listPageSizeOptions, type ListPageSize } from '@/lib/list-pagination';
import { cn } from '@/lib/utils';

/**
 * Compact page navigation for table-like list views. Renders a "Page X of Y (N items)" caption
 * on the left and Previous/Next buttons on the right.
 *
 * Layout & button styles are normalized across the app:
 * - Button-style "tooltip" variant (default) — matches `DataTable` (`ChevronLeft/Right` icons).
 * - "minimal" variant — matches the lighter list pages (trader-payin, appeals, settlements):
 *   plain `bg-bg-secondary` rounded buttons with localized "← Previous" / "Next →" labels.
 */
export function PaginationControls({
  page,
  totalPages,
  onPageChange,
  totalItems,
  itemLabel = 'items',
  variant = 'tooltip',
  className,
  /** When `false`, only the Previous/Next buttons render (no caption). */
  showCaption = true,
  /** Override caption text — useful when phrasing differs ("Showing page X of Y …"). */
  captionOverride,
  pageSize,
  onPageSizeChange,
  rowsPerPageLabel = 'Rows per page',
}: {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  totalItems?: number;
  itemLabel?: string;
  variant?: 'tooltip' | 'minimal';
  className?: string;
  showCaption?: boolean;
  captionOverride?: string;
  pageSize?: number;
  onPageSizeChange?: (pageSize: ListPageSize) => void;
  rowsPerPageLabel?: string;
}) {
  const showPageSize = pageSize != null && onPageSizeChange != null;

  if (totalPages <= 1 && !showPageSize) return null;

  const canPrev = page > 1;
  const canNext = page < totalPages;

  const caption = captionOverride
    ? captionOverride
    : totalItems != null
      ? totalPages > 1
        ? `Page ${page} of ${totalPages} (${totalItems} ${itemLabel})`
        : `${totalItems} ${itemLabel}`
      : totalPages > 1
        ? `Page ${page} of ${totalPages}`
        : '';

  const pageSizeSelect = showPageSize ? (
    <Select
      label={rowsPerPageLabel}
      labelClassName="text-xs text-text-muted sr-only"
      rootClassName="gap-1 w-auto flex-row items-center"
      className="!min-h-9 !py-1.5 min-w-[5rem]"
      options={listPageSizeOptions()}
      value={String(pageSize)}
      onChange={(e) => onPageSizeChange(Number(e.target.value) as ListPageSize)}
    />
  ) : null;

  if (variant === 'minimal') {
    return (
      <div
        className={cn(
          'flex flex-col gap-3 text-sm text-text-muted sm:flex-row sm:items-center sm:justify-between',
          className,
        )}
      >
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          {showCaption && caption ? <span className="min-w-0">{caption}</span> : null}
          {pageSizeSelect}
        </div>
        {totalPages > 1 ? (
        <div className="flex shrink-0 gap-2 self-end sm:self-auto">
          <button
            type="button"
            className="min-h-11 rounded bg-bg-secondary px-3 py-2 disabled:opacity-40 sm:min-h-0 sm:py-1"
            onClick={() => onPageChange(Math.max(1, page - 1))}
            disabled={!canPrev}
          >
            ← Previous
          </button>
          <button
            type="button"
            className="min-h-11 rounded bg-bg-secondary px-3 py-2 disabled:opacity-40 sm:min-h-0 sm:py-1"
            onClick={() => onPageChange(Math.min(totalPages, page + 1))}
            disabled={!canNext}
          >
            Next →
          </button>
        </div>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between',
        className,
      )}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-3">
        {showCaption && caption ? (
          <p className="min-w-0 text-sm text-text-muted">{caption}</p>
        ) : null}
        {pageSizeSelect}
      </div>
      {totalPages > 1 ? (
      <div className="flex shrink-0 gap-2 self-end sm:self-auto">
        <Tooltip content="Previous page" side="top">
          <span className="inline-flex">
            <button
              type="button"
              onClick={() => onPageChange(page - 1)}
              disabled={!canPrev}
              className="inline-flex min-h-11 cursor-pointer items-center gap-1 rounded-lg border border-border-primary bg-bg-secondary px-3 py-2 text-sm text-text-secondary transition-colors hover:bg-bg-hover disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-0 sm:py-1.5"
            >
              <ChevronLeft className="h-4 w-4" /> Previous
            </button>
          </span>
        </Tooltip>
        <Tooltip content="Next page" side="top">
          <span className="inline-flex">
            <button
              type="button"
              onClick={() => onPageChange(page + 1)}
              disabled={!canNext}
              className="inline-flex min-h-11 cursor-pointer items-center gap-1 rounded-lg border border-border-primary bg-bg-secondary px-3 py-2 text-sm text-text-secondary transition-colors hover:bg-bg-hover disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-0 sm:py-1.5"
            >
              Next <ChevronRight className="h-4 w-4" />
            </button>
          </span>
        </Tooltip>
      </div>
      ) : null}
    </div>
  );
}
