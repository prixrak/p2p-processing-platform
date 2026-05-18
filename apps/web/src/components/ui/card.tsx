import { Link } from '@/i18n/navigation';
import { clsx } from 'clsx';
import type { LucideIcon } from 'lucide-react';
import {
  type SurfaceRingTone,
  surfaceIconWrapClass,
  surfaceRingClass,
} from '@/lib/surface-ring';

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  trend?: { value: number; positive: boolean };
  href?: string;
  className?: string;
  /** Accent border; defaults to neutral. */
  tone?: SurfaceRingTone;
}

export function StatCard({ title, value, subtitle, icon: Icon, trend, href, className, tone = 'neutral' }: StatCardProps) {
  const cardClass = clsx(
    'rounded-xl p-5 transition-colors',
    surfaceRingClass(tone),
    href && 'cursor-pointer hover:border-border-secondary',
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
        <div className={clsx('rounded-lg p-2.5', surfaceIconWrapClass(tone))}>
          <Icon className="h-5 w-5" />
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
  tone?: SurfaceRingTone;
}

export function Card({ children, className, title, action, tone = 'neutral' }: CardProps) {
  return (
    <div
      className={clsx(
        'rounded-xl',
        surfaceRingClass(tone),
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
