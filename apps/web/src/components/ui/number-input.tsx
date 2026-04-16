'use client';

import {
  forwardRef,
  type ChangeEvent,
  type InputHTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { clsx } from 'clsx';

export type NumberInputVariant = 'default' | 'amount' | 'percent' | 'rate' | 'integer';

export interface NumberInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> {
  label?: string;
  error?: string;
  /** Visual / defaults for step & inputMode */
  variant?: NumberInputVariant;
  /** Amounts and rates are easier to scan right-aligned */
  align?: 'start' | 'end';
  /** Shown inside the field on the right (e.g. %, currency code) */
  suffix?: ReactNode;
}

const VARIANT_DEFAULTS: Record<
  NumberInputVariant,
  { step?: string; inputMode?: 'decimal' | 'numeric'; min?: number }
> = {
  default: { inputMode: 'decimal' },
  amount: { step: 'any', inputMode: 'decimal', min: 0 },
  percent: { step: '0.01', inputMode: 'decimal', min: 0 },
  rate: { step: '0.0001', inputMode: 'decimal', min: 0 },
  integer: { step: '1', inputMode: 'numeric', min: 0 },
};

export const NumberInput = forwardRef<HTMLInputElement, NumberInputProps>(
  (
    {
      className,
      label,
      error,
      id,
      variant = 'default',
      align = 'end',
      suffix,
      step,
      inputMode,
      min: minProp,
      onChange,
      onKeyDown,
      ...props
    },
    ref,
  ) => {
    const d = VARIANT_DEFAULTS[variant];
    const resolvedStep = step !== undefined ? step : d.step;
    const resolvedInputMode = inputMode ?? d.inputMode;
    const resolvedMin = minProp !== undefined ? minProp : d.min;

    /** If the only character is "0", typing 1–9 replaces it (avoids "05"). */
    const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
      const el = e.currentTarget;
      if (el.value === '0' && /^[1-9]$/.test(e.key)) {
        e.preventDefault();
        const next = e.key;
        const synthetic = {
          ...e,
          target: { ...el, value: next },
          currentTarget: { ...el, value: next },
        } as ChangeEvent<HTMLInputElement>;
        onChange?.(synthetic);
        return;
      }
      onKeyDown?.(e);
    };

    return (
      <div className="space-y-1.5">
        {label && (
          <label htmlFor={id} className="block text-sm font-medium text-text-secondary">
            {label}
          </label>
        )}
        <div className="relative">
          <input
            ref={ref}
            id={id}
            type="number"
            inputMode={resolvedInputMode}
            step={resolvedStep}
            {...(resolvedMin !== undefined ? { min: resolvedMin } : {})}
            className={clsx(
              'w-full rounded-lg border border-border-primary bg-surface-primary px-3 py-2 text-sm text-text-primary',
              'font-mono tabular-nums',
              align === 'end' ? 'text-end' : 'text-start',
              'placeholder:text-text-muted',
              'focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent',
              'disabled:cursor-not-allowed disabled:opacity-50',
              'transition-colors',
              '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none',
              suffix && 'pr-10',
              error && 'border-danger focus:border-danger focus:ring-danger',
              className,
            )}
            onChange={onChange}
            onKeyDown={handleKeyDown}
            {...props}
          />
          {suffix ? (
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-text-muted">
              {suffix}
            </span>
          ) : null}
        </div>
        {error && <p className="text-xs text-danger">{error}</p>}
      </div>
    );
  },
);
NumberInput.displayName = 'NumberInput';
