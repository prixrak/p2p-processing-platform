'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { clsx } from 'clsx';
import { Button } from '@/components/ui/button';
import { Tooltip } from '@/components/ui/tooltip';

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** Shown in tooltip and aria-label */
  label: string;
  /** Multi-line tooltip (long hints); maps to Tooltip `wide` */
  tooltipWide?: boolean;
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'danger' | 'success' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
}

/**
 * Square-ish icon button with hover hint (use for toolbar / table actions).
 */
export function IconButton({
  label,
  tooltipWide = false,
  children,
  className,
  variant = 'ghost',
  size = 'sm',
  loading,
  disabled,
  type = 'button',
  ...props
}: IconButtonProps) {
  return (
    <Tooltip content={label} wide={tooltipWide}>
      <span className="inline-flex shrink-0">
        <Button
          type={type}
          variant={variant}
          size={size}
          loading={loading}
          disabled={disabled}
          aria-label={label}
          className={clsx('!p-2 min-h-9 min-w-9 shrink-0', className)}
          {...props}
        >
          {children}
        </Button>
      </span>
    </Tooltip>
  );
}
