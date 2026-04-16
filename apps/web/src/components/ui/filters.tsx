'use client';

import { Search, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/utils';

interface FilterBarProps {
  children: ReactNode;
  className?: string;
}

export function FilterBar({ children, className }: FilterBarProps) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-end gap-3 p-4 bg-bg-card border border-border-primary rounded-xl',
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
}

export function FilterSelect({
  label,
  value,
  onChange,
  options,
  placeholder,
  className,
}: FilterSelectProps) {
  return (
    <Select
      label={label}
      labelClassName="text-xs font-normal text-text-muted"
      rootClassName="gap-1 min-w-[10rem]"
      options={options}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={className}
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
}

export function FilterInput({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  className,
}: FilterInputProps) {
  const showClear = Boolean(value);

  return (
    <div className={cn('flex min-w-0 flex-col gap-1', className)}>
      <label className="text-xs text-text-muted">{label}</label>
      <div className="relative">
        {type === 'text' && (
          <Search
            size={14}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted"
          />
        )}
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          inputMode={type === 'number' ? 'decimal' : undefined}
          className={cn(
            'h-10 w-full min-w-0 rounded-lg border border-border-primary bg-bg-input text-sm text-text-primary placeholder:text-text-muted focus:border-border-focus focus:outline-none',
            type === 'text' ? 'pl-8' : 'px-3',
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
