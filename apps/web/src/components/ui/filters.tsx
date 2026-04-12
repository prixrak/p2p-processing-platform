'use client';

import { clsx } from 'clsx';
import { Search, X } from 'lucide-react';
import type { ReactNode } from 'react';

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
    <div className={clsx('flex flex-col gap-1', className)}>
      <label className="text-xs text-text-muted">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="px-3 py-1.5 text-sm bg-bg-input border border-border-primary rounded-lg text-text-primary focus:border-border-focus focus:outline-none"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
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
          className={clsx(
            'py-1.5 text-sm bg-bg-input border border-border-primary rounded-lg text-text-primary placeholder:text-text-muted focus:border-border-focus focus:outline-none',
            type === 'text' ? 'pl-8 pr-3' : 'px-3',
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
