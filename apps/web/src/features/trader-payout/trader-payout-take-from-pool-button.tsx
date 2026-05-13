'use client';

import { useState } from 'react';
import { Play, AlertTriangle } from 'lucide-react';
import type { UseMutationResult } from '@tanstack/react-query';
import type { PayOutOrderApiDto } from '@p2p/shared';
import { IconButton } from '@/components/ui/icon-button';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { formatCurrency } from '@/lib/utils';

export function TraderPayoutTakeFromPoolButton({
  order,
  takeFromPoolMutation,
  layout,
  onConfirmed,
}: {
  order: PayOutOrderApiDto;
  takeFromPoolMutation: UseMutationResult<unknown, unknown, string>;
  layout: 'icon' | 'toolbar';
  /** Optional hook after user confirms take (for example closing a parent modal). */
  onConfirmed?: () => void;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const loading =
    takeFromPoolMutation.isPending && takeFromPoolMutation.variables === order.id;

  const handleConfirm = () => {
    takeFromPoolMutation.mutate(order.id);
    setConfirmOpen(false);
    onConfirmed?.();
  };

  return (
    <>
      {layout === 'icon' ? (
        <IconButton
          label="Take order from pool"
          variant="primary"
          onClick={() => setConfirmOpen(true)}
          loading={loading}
        >
          <Play className="h-4 w-4" />
        </IconButton>
      ) : (
        <Button variant="primary" onClick={() => setConfirmOpen(true)} loading={loading}>
          <Play className="h-4 w-4" />
          Take from Pool
        </Button>
      )}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={(o) => {
          if (!o && !loading) setConfirmOpen(o);
        }}
        title="Take this pay-out into work?"
        description={
          <>
            Amount <strong>{formatCurrency(order.amount, order.currency)}</strong>. This assigns the
            order to you. Continue only if you are ready to process this payout.
          </>
        }
        confirmLabel="Yes, take order"
        cancelLabel="Cancel"
        icon={<AlertTriangle className="h-5 w-5 text-accent-yellow shrink-0" />}
        loading={loading}
        onConfirm={handleConfirm}
      />
    </>
  );
}
