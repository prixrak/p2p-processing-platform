import { clsx } from 'clsx';
import type { LucideIcon } from 'lucide-react';

interface StatCardProps {
  label: string;
  value: string | number;
  icon?: LucideIcon;
  change?: { value: number; positive: boolean };
  className?: string;
}

export function StatCard({ label, value, icon: Icon, change, className }: StatCardProps) {
  return (
    <div
      className={clsx(
        'rounded-xl border border-border-primary bg-surface-secondary p-5 transition-colors hover:border-border-secondary',
        className,
      )}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-sm text-text-muted">{label}</p>
          <p className="text-2xl font-bold text-text-primary">{value}</p>
        </div>
        {Icon && (
          <div className="rounded-lg bg-accent-muted p-2.5">
            <Icon className="h-5 w-5 text-accent" />
          </div>
        )}
      </div>
      {change && (
        <div className="mt-3 flex items-center gap-1 text-xs">
          <span className={change.positive ? 'text-success' : 'text-danger'}>
            {change.positive ? '+' : ''}{change.value}%
          </span>
          <span className="text-text-muted">vs last period</span>
        </div>
      )}
    </div>
  );
}
