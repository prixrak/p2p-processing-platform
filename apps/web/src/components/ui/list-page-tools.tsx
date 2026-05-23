'use client';

import { Filter, RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { FilterInput, FilterSelect } from '@/components/ui/filters';

export type ListPageSelectOption = { value: string; label: string };

export function ListPageRefreshButton({
  onRefresh,
  isRefreshing = false,
}: {
  onRefresh: () => void | Promise<void>;
  isRefreshing?: boolean;
}) {
  const t = useTranslations('Trader.Common');

  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      disabled={isRefreshing}
      onClick={() => void onRefresh()}
      aria-label={t('refresh')}
    >
      <RefreshCw className={cn('h-4 w-4', isRefreshing && 'animate-spin')} />
      {isRefreshing ? t('refreshing') : t('refresh')}
    </Button>
  );
}

export function ListPageHeader({
  title,
  description,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        {title}
        {description ? <div className="mt-1 text-sm text-text-muted">{description}</div> : null}
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-3 sm:justify-end">{actions}</div>
      ) : null}
    </div>
  );
}

export function FiltersToggleButton({
  expanded,
  onToggle,
}: {
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <Button type="button" variant="secondary" size="sm" onClick={onToggle} aria-expanded={expanded}>
      <Filter className="h-4 w-4" />
      Filters
    </Button>
  );
}

export function SearchStatusRow({
  searchLabel = 'Search',
  searchValue,
  onSearchChange,
  searchPlaceholder,
  statusLabel = 'Status',
  statusValue,
  onStatusChange,
  statusOptions,
  trailing,
}: {
  searchLabel?: string;
  searchValue: string;
  onSearchChange: (v: string) => void;
  searchPlaceholder?: string;
  statusLabel?: string;
  statusValue: string;
  onStatusChange: (v: string) => void;
  statusOptions: ListPageSelectOption[];
  /** e.g. primary action button aligned with this row (reference catalog). */
  trailing?: ReactNode;
}) {
  const fields = (
    <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-end sm:gap-4">
      <FilterInput
        label={searchLabel}
        value={searchValue}
        onChange={onSearchChange}
        placeholder={searchPlaceholder}
        className="min-w-0 w-full sm:flex-1 sm:basis-0 sm:max-w-2xl"
      />
      <div className="w-full shrink-0 sm:w-48">
        <FilterSelect
          label={statusLabel}
          value={statusValue}
          onChange={onStatusChange}
          options={statusOptions}
        />
      </div>
    </div>
  );

  if (!trailing) {
    return (
      <div className="flex w-full min-w-0 flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
        {fields}
      </div>
    );
  }

  return (
    <div className="flex w-full min-w-0 flex-col gap-3 lg:flex-row lg:items-end lg:justify-between lg:gap-4">
      {fields}
      <div className="flex shrink-0 justify-end">{trailing}</div>
    </div>
  );
}

/** Flexible filter row (staff orders, etc.): children should set their own widths / flex-1. */
export function FilterFieldsRow({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex w-full min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:gap-4',
        className,
      )}
    >
      {children}
    </div>
  );
}
