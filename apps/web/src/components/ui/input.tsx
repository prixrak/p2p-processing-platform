'use client';

import { forwardRef, type InputHTMLAttributes } from 'react';
import { clsx } from 'clsx';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  /** Danger border/focus ring without helper text (e.g. server-side credential failure). */
  highlightInvalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, highlightInvalid, id, ...props }, ref) => {
    const invalid = Boolean(error) || Boolean(highlightInvalid);
    return (
      <div className="space-y-1.5">
        {label && (
          <label htmlFor={id} className="block text-sm font-medium text-text-secondary">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={id}
          aria-invalid={invalid}
          className={clsx(
            'w-full rounded-lg border border-border-primary bg-surface-primary px-3 py-2 text-sm text-text-primary',
            'placeholder:text-text-muted',
            'focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent',
            'disabled:cursor-not-allowed disabled:opacity-50',
            'transition-colors',
            invalid && 'border-danger focus:border-danger focus:ring-danger',
            className,
          )}
          {...props}
        />
        {error ? <p className="text-xs text-danger">{error}</p> : null}
      </div>
    );
  },
);
Input.displayName = 'Input';
