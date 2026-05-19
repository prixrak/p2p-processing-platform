import type { ReactNode } from 'react';
import { clsx } from 'clsx';

type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'muted';
type BadgeColor = 'green' | 'yellow' | 'red' | 'blue' | 'default';

interface BadgeProps {
  children: ReactNode;
  variant?: BadgeVariant;
  color?: BadgeColor;
  dot?: boolean;
  /** Renders instead of the dot when provided (same size as icon-sized dots elsewhere). */
  leadingIcon?: ReactNode;
  className?: string;
  title?: string;
}

const variantStyles: Record<BadgeVariant, string> = {
  default: 'bg-bg-tertiary text-text-secondary',
  success: 'bg-accent-green/15 text-accent-green',
  warning: 'bg-accent-yellow/15 text-accent-yellow',
  danger: 'bg-accent-red/15 text-accent-red',
  info: 'bg-accent-blue/15 text-accent-blue',
  muted: 'bg-bg-hover text-text-muted',
};

const dotStyles: Record<BadgeVariant, string> = {
  default: 'bg-text-secondary',
  success: 'bg-accent-green',
  warning: 'bg-accent-yellow',
  danger: 'bg-accent-red',
  info: 'bg-accent-blue',
  muted: 'bg-text-muted',
};

const colorToVariant: Record<BadgeColor, BadgeVariant> = {
  green: 'success',
  yellow: 'warning',
  red: 'danger',
  blue: 'info',
  default: 'default',
};

export function Badge({ children, variant, color, dot, leadingIcon, className, title }: BadgeProps) {
  const resolved = variant ?? (color ? colorToVariant[color] : 'default');
  const showDot = dot && leadingIcon == null;
  return (
    <span
      title={title}
      className={clsx(
        'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap',
        variantStyles[resolved],
        className,
      )}
    >
      {leadingIcon != null ? (
        <span className="inline-flex shrink-0 opacity-90 [&_svg]:h-3.5 [&_svg]:w-3.5">
          {leadingIcon}
        </span>
      ) : (
        showDot && <span className={clsx('h-1.5 w-1.5 rounded-full', dotStyles[resolved])} />
      )}
      {children}
    </span>
  );
}

const statusVariantMap: Record<string, BadgeVariant> = {
  active: 'success',
  completed: 'success',
  confirmed: 'success',
  sent: 'success',
  enabled: 'success',
  paid: 'success',
  verified: 'info',
  pending: 'warning',
  processing: 'warning',
  awaiting_payment: 'warning',
  new: 'info',
  created: 'info',
  failed: 'danger',
  cancelled: 'danger',
  canceled: 'danger',
  expired: 'danger',
  disabled: 'danger',
  dlq: 'danger',
  disputed: 'danger',
  inactive: 'danger',
  appeal: 'warning',
  underpaid: 'warning',
  overpaid: 'warning',
  upload_failed: 'danger',
};

export function StatusBadge({ status }: { status: string }) {
  const variant = statusVariantMap[status.toLowerCase()] || 'muted';
  return (
    <Badge variant={variant}>
      {status.replace(/_/g, ' ').toUpperCase()}
    </Badge>
  );
}
