import { cn } from '@/lib/utils';

interface ProgressBarProps {
  value: number;
  max: number;
  label?: string;
  showValues?: boolean;
  className?: string;
  size?: 'sm' | 'md';
}

export function ProgressBar({
  value,
  max,
  label,
  showValues = true,
  className,
  size = 'md',
}: ProgressBarProps) {
  const percent = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  const isHigh = percent >= 80;
  const isFull = percent >= 100;

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      {(label || showValues) && (
        <div className="flex items-baseline justify-between gap-3 text-xs">
          {label && <span className="shrink-0 text-text-muted">{label}</span>}
          {showValues && (
            <span
              className={cn(
                'min-w-0 text-end tabular-nums font-medium',
                isFull ? 'text-accent-red' : 'text-text-secondary',
              )}
            >
              {value.toLocaleString()} / {max.toLocaleString()}
            </span>
          )}
        </div>
      )}
      <div
        className={cn(
          'w-full overflow-hidden rounded-full bg-bg-secondary',
          size === 'sm' ? 'h-1.5' : 'h-2.5',
        )}
      >
        <div
          className={cn(
            'h-full rounded-full transition-all duration-500',
            isFull ? 'bg-accent-red' : isHigh ? 'bg-accent-yellow' : 'bg-accent-blue',
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
