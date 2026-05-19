'use client';

import { Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip } from '@/components/ui/tooltip';
import { toast } from '@/components/ui/toast';
import { useCopyToClipboard } from '@/lib/hooks/use-copy-to-clipboard';
import { cn } from '@/lib/utils';
import { payinOrderRequisiteSnapshot, type PayinRequisiteListRow } from '@/lib/payin-requisite-snapshot';

function requisiteTooltipLine(label: string, value: string) {
  return (
    <div className="text-left">
      <span className="text-text-muted">{label}</span>
      <span className="ml-1 font-medium text-text-primary break-words">{value}</span>
    </div>
  );
}

/** Last-four preview + one-click copy; hover shows owner, bank, requisite type. */
export function PayinRequisiteTableCell({ row }: { row: PayinRequisiteListRow }) {
  const snap = payinOrderRequisiteSnapshot(row);
  const { copied, copy: copyText } = useCopyToClipboard({
    onSuccess: () => toast.success('Requisite number copied'),
    onError: () => toast.error('Could not copy to clipboard'),
  });

  if (!snap.hasRequisite || snap.lastFourDisplay == null) {
    return <span className="text-text-muted">—</span>;
  }

  const tooltipBody = (
    <div className="space-y-1.5 text-xs leading-snug">
      {requisiteTooltipLine('Owner:', snap.owner ?? '—')}
      {requisiteTooltipLine('Card holder:', snap.cardHolderName ?? '—')}
      {requisiteTooltipLine('Bank:', snap.bank ?? '—')}
      {requisiteTooltipLine('Type:', snap.type ?? '—')}
    </div>
  );

  return (
    <Tooltip content={tooltipBody} wide side="top">
      <span className="inline-flex max-w-full items-center gap-1">
        <span className="truncate font-mono text-sm tabular-nums text-text-primary">
          ···{snap.lastFourDisplay}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label="Copy requisite number"
          className={cn('!p-2 min-h-9 min-w-9 shrink-0', copied && '[&_svg]:text-accent-green')}
          onClick={(e) => {
            e.stopPropagation();
            void copyText(snap.copyValue);
          }}
        >
          <Copy className="h-4 w-4 shrink-0 text-text-muted" />
        </Button>
      </span>
    </Tooltip>
  );
}
