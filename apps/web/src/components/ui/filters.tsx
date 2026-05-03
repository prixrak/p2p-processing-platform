'use client';

import { Search, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/utils';

interface FilterBarProps {
  children: ReactNode;
  className?: string;
  /** Tighter padding and border for dense toolbars (e.g. user directory). */
  dense?: boolean;
}

export function FilterBar({ children, className, dense }: FilterBarProps) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-end gap-3 p-4 bg-bg-card border border-border-primary rounded-xl',
        dense &&
          'flex-nowrap items-end gap-2 overflow-x-auto py-1 rounded-none border-0 bg-transparent p-0 shadow-none ring-0',
        className,
      )}
    >
      {children}
    </div>
  );
}

interface FilterSelectProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  /** Shown when nothing is selected (optional empty option still works). */
  placeholder?: string;
  className?: string;
  compact?: boolean;
  /** With compact: fixed narrow column (label truncates in the trigger). */
  narrow?: boolean;
}

export function FilterSelect({
  label,
  value,
  onChange,
  options,
  placeholder,
  className,
  compact,
  narrow,
}: FilterSelectProps) {
  return (
    <Select
      label={label}
      labelClassName={cn(
        'font-normal text-text-muted',
        compact ? 'text-[10px] uppercase tracking-wide leading-none' : 'text-xs',
      )}
      rootClassName={cn(
        'gap-1',
        compact && narrow && 'min-w-0 w-[7rem] max-w-[7.25rem] shrink-0 gap-0.5',
        compact && !narrow && 'min-w-[7.25rem] gap-0.5',
        !compact && 'min-w-[10rem]',
      )}
      options={options}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={cn(compact && '!min-h-9 !py-1.5 !text-xs !px-2', className)}
    />
  );
}

interface FilterInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  className?: string;
  compact?: boolean;
}

export function FilterInput({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  className,
  compact,
}: FilterInputProps) {
  const showClear = Boolean(value);

  return (
    <div className={cn('flex min-w-0 flex-col', compact ? 'gap-0.5' : 'gap-1', className)}>
      <label
        className={cn(
          'text-text-muted',
          compact ? 'text-[10px] uppercase tracking-wide leading-none' : 'text-xs',
        )}
      >
        {label}
      </label>
      <div className="relative">
        {type === 'text' && (
          <Search
            size={compact ? 13 : 14}
            className={cn(
              'pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted',
              compact && 'left-2',
            )}
          />
        )}
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          inputMode={type === 'number' ? 'decimal' : undefined}
          className={cn(
            'w-full min-w-0 rounded-lg border border-border-primary bg-bg-input text-text-primary placeholder:text-text-muted focus:border-border-focus focus:outline-none',
            compact ? 'h-9 text-xs' : 'h-10 text-sm',
            type === 'text' ? (compact ? 'pl-7' : 'pl-8') : 'px-3',
            showClear ? 'pr-8' : type === 'text' ? 'pr-3' : '',
            type === 'number' &&
              'font-mono tabular-nums text-end [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none',
          )}
        />
        {showClear && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
            aria-label="Clear"
          >
            <X size={12} />
          </button>
        )}
      </div>
    </div>
  );
}
