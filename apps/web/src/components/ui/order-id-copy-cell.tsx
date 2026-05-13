'use client';

import { Copy } from 'lucide-react';
import { toast } from '@/components/ui/toast';
import { IconButton } from '@/components/ui/icon-button';
import { useCopyToClipboard } from '@/lib/hooks/use-copy-to-clipboard';
import { shortId, cn } from '@/lib/utils';

/**
 * Renders a clickable short order-id chip that copies the full id to the clipboard.
 *
 * Two visual variants:
 * - `chip` (default) — bordered button with background; used in pay-in tables.
 * - `inline` — flush `shortId + IconButton`; used in pay-out tables.
 *
 * `withToast` toggles a success/error toast on copy (matches existing pay-in behavior).
 */
export function OrderIdCopyCell({
  id,
  variant = 'chip',
  withToast = false,
}: {
  id: string;
  variant?: 'chip' | 'inline';
  withToast?: boolean;
}) {
  const { copied, copy: copyText } = useCopyToClipboard({
    onSuccess: withToast ? () => toast.success('Order ID copied') : undefined,
    onError: withToast ? () => toast.error('Could not copy to clipboard') : undefined,
  });
  const copy = () => copyText(id);

  if (variant === 'inline') {
    return (
      <div className="flex items-center justify-end gap-1">
        <span className="font-mono text-xs text-text-muted">{shortId(id)}</span>
        <IconButton
          label="Copy full order ID"
          onClick={(e) => {
            e.stopPropagation();
            void copy();
          }}
        >
          <Copy className={cn('h-4 w-4', copied && 'text-accent-green')} />
        </IconButton>
      </div>
    );
  }

  return (
    <button
      type="button"
      title={id}
      onClick={(e) => {
        e.stopPropagation();
        void copy();
      }}
      className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-border-primary bg-surface-tertiary/40 px-2 py-1 text-left transition-colors hover:border-accent-blue hover:bg-surface-tertiary"
    >
      <span className="truncate font-mono text-xs text-text-primary">{shortId(id)}</span>
      <Copy className={cn('h-4 w-4 shrink-0 text-text-muted', copied && 'text-accent-green')} />
    </button>
  );
}
