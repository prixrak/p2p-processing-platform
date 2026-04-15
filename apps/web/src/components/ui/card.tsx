import Link from 'next/link';
import { clsx } from 'clsx';
import type { LucideIcon } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  trend?: { value: number; positive: boolean };
  href?: string;
  className?: string;
}

export function StatCard({ title, value, subtitle, icon: Icon, trend, href, className }: StatCardProps) {
  const cardClass = clsx(
    'rounded-xl border border-border-primary bg-surface-secondary p-5 transition-colors hover:border-border-secondary',
    href && 'cursor-pointer',
    className,
  );

  const content = (
    <>
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-sm text-text-muted">{title}</p>
          <p className="text-2xl font-bold text-text-primary">{value}</p>
          {subtitle && <p className="text-xs text-text-muted">{subtitle}</p>}
        </div>
        <div className="rounded-lg bg-accent-muted p-2.5">
          <Icon className="h-5 w-5 text-accent" />
        </div>
      </div>
      {trend && (
        <div className="mt-3 flex items-center gap-1 text-xs">
          <span className={trend.positive ? 'text-success' : 'text-danger'}>
            {trend.positive ? '+' : ''}{trend.value}%
          </span>
          <span className="text-text-muted">vs last period</span>
        </div>
      )}
    </>
  );

  if (href) {
    return (
      <Link href={href} className={cardClass}>
        {content}
      </Link>
    );
  }

  return <div className={cardClass}>{content}</div>;
}

interface CardProps {
  children: React.ReactNode;
  className?: string;
  title?: string;
  action?: React.ReactNode;
}

export function Card({ children, className, title, action }: CardProps) {
  return (
    <div
      className={clsx(
        'rounded-xl border border-border-primary bg-surface-secondary',
        className,
      )}
    >
      {title && (
        <div className="flex items-center justify-between border-b border-border-primary px-5 py-4">
          <h3 className="font-semibold text-text-primary">{title}</h3>
          {action}
        </div>
      )}
      <div className={title ? 'p-5' : 'p-5'}>{children}</div>
    </div>
  );
}
