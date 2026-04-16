'use client';

import { clsx } from 'clsx';
import { Search, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { Select } from '@/components/ui/select';

interface FilterBarProps {
  children: ReactNode;
  className?: string;
}

export function FilterBar({ children, className }: FilterBarProps) {
  return (
    <div
      className={clsx(
        'flex flex-wrap items-center gap-3 p-4 bg-bg-card border border-border-primary rounded-xl',
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
  className?: string;
}

export function FilterSelect({
  label,
  value,
  onChange,
  options,
  className,
}: FilterSelectProps) {
  return (
    <Select
      label={label}
      options={options}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={clsx('min-w-[10rem]', className)}
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
  return (
    <div className={clsx('flex flex-col gap-1', className)}>
      <label className="text-xs text-text-muted">{label}</label>
      <div className="relative">
        {type === 'text' && (
          <Search
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted"
          />
        )}
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          inputMode={type === 'number' ? 'decimal' : undefined}
          className={clsx(
            'py-1.5 text-sm bg-bg-input border border-border-primary rounded-lg text-text-primary placeholder:text-text-muted focus:border-border-focus focus:outline-none',
            type === 'text' ? 'pl-8 pr-3' : 'px-3',
            type === 'number' &&
              'font-mono tabular-nums text-end [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none',
          )}
        />
        {value && (
          <button
            onClick={() => onChange('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
          >
            <X size={12} />
          </button>
        )}
      </div>
    </div>
  );
}
