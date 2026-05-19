'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Play, AlertTriangle } from 'lucide-react';
import type { UseMutationResult } from '@tanstack/react-query';
import type { PayOutOrderCabinetDto } from '@p2p/shared';
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
  order: PayOutOrderCabinetDto;
  takeFromPoolMutation: UseMutationResult<unknown, unknown, string>;
  layout: 'icon' | 'toolbar';
  /** Optional hook after user confirms take (for example closing a parent modal). */
  onConfirmed?: () => void;
}) {
  const t = useTranslations('Trader.Payout');
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
          label={t('takeFromPoolAria')}
          variant="primary"
          onClick={() => setConfirmOpen(true)}
          loading={loading}
        >
          <Play className="h-4 w-4" />
        </IconButton>
      ) : (
        <Button variant="primary" onClick={() => setConfirmOpen(true)} loading={loading}>
          <Play className="h-4 w-4" />
          {t('takeFromPoolButton')}
        </Button>
      )}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={(o) => {
          if (!o && !loading) setConfirmOpen(o);
        }}
        title={t('takeConfirmTitle')}
        description={
          <>
            {t('takeConfirmDescription', {
              amount: formatCurrency(order.amount, order.currency),
            })}
          </>
        }
        confirmLabel={t('takeConfirm')}
        cancelLabel={t('takeCancel')}
        icon={<AlertTriangle className="h-5 w-5 text-accent-yellow shrink-0" />}
        loading={loading}
        onConfirm={handleConfirm}
      />
    </>
  );
}
