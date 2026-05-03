import { clsx } from 'clsx';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'success' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  loading?: boolean;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    'bg-accent-blue text-white hover:bg-accent-blue-hover active:bg-accent-blue-hover/90',
  secondary:
    'bg-bg-tertiary text-text-primary border border-border-primary hover:bg-bg-hover active:bg-bg-secondary active:border-border-secondary',
  danger:
    'bg-accent-red text-white hover:bg-accent-red-hover active:bg-accent-red-hover/90',
  success:
    'bg-accent-green text-white hover:bg-accent-green-hover active:bg-accent-green-hover/90',
  ghost:
    'text-text-secondary hover:text-text-primary hover:bg-bg-hover active:bg-bg-secondary',
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
  lg: 'px-5 py-2.5 text-sm',
};

export function Button({
  variant = 'primary',
  size = 'md',
  icon,
  loading,
  children,
  className,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={clsx(
        'inline-flex items-center justify-center gap-2 font-medium rounded-lg transition-colors',
        'focus:outline-none focus:ring-2 focus:ring-accent-blue/40',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        !disabled && !loading && 'cursor-pointer',
        variantStyles[variant],
        sizeStyles[size],
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
      ) : (
        icon
      )}
      {children}
    </button>
  );
}
