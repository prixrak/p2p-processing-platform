import Link from 'next/link';
import { clsx } from 'clsx';
import type { LucideIcon } from 'lucide-react';
import {
  type SurfaceRingTone,
  surfaceIconWrapClass,
  surfaceRingClass,
} from '@/lib/surface-ring';

interface StatCardProps {
  label: string;
  value: string | number;
  icon?: LucideIcon;
  change?: { value: number; positive: boolean };
  href?: string;
  className?: string;
  tone?: SurfaceRingTone;
}

export function StatCard({ label, value, icon: Icon, change, href, className, tone = 'neutral' }: StatCardProps) {
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
          <p className="text-sm text-text-muted">{label}</p>
          <p className="text-2xl font-bold text-text-primary">{value}</p>
        </div>
        {Icon && (
          <div className={clsx('rounded-lg p-2.5', surfaceIconWrapClass(tone))}>
            <Icon className="h-5 w-5" />
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
