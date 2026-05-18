'use client';

import { Copy } from 'lucide-react';
import { toast } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { Tooltip } from '@/components/ui/tooltip';
import { useCopyToClipboard } from '@/lib/hooks/use-copy-to-clipboard';
import { cn } from '@/lib/utils';

/**
 * Copy-only control for long identifiers: hover shows the full value; click copies it.
 *
 * Use `withToast` for a short confirmation after copy (Pay-In trader table).
 */
export function OrderIdCopyCell({
  id,
  withToast = false,
  /** Used in aria-label and success toast (e.g. "Order ID", "External ID"). */
  label = 'Order ID',
}: {
  id: string;
  withToast?: boolean;
  label?: string;
}) {
  const trimmed = id.trim();
  if (!trimmed) {
    return <span className="text-text-muted">—</span>;
  }

  const { copied, copy: copyText } = useCopyToClipboard({
    onSuccess: withToast ? () => toast.success(`${label} copied`) : undefined,
    onError: withToast ? () => toast.error('Could not copy to clipboard') : undefined,
  });

  const copy = () => copyText(trimmed);

  return (
    <Tooltip content={<span className="font-mono break-all">{trimmed}</span>} wide side="top">
      <span className="inline-flex shrink-0 justify-end">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={`Copy ${label}`}
          className={cn('!p-2 min-h-9 min-w-9 shrink-0', copied && '[&_svg]:text-accent-green')}
          onClick={(e) => {
            e.stopPropagation();
            void copy();
          }}
        >
          <Copy className="h-4 w-4 shrink-0 text-text-muted" />
        </Button>
      </span>
    </Tooltip>
  );
}
