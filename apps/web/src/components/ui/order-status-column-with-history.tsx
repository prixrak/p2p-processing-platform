'use client';

import { useState } from 'react';
import { History } from 'lucide-react';
import { IconButton } from '@/components/ui/icon-button';
import { OrderStatusHistoryModal } from '@/components/ui/order-status-history-modal';

export function OrderStatusColumnWithHistory({
  orderId,
  fetchPath,
  direction,
  children,
  historyLabel = 'Change history',
  modalTitle = 'Status history',
  statusLabel,
  changedByLabel,
  emptyLabel,
  closeLabel,
}: {
  orderId: string;
  fetchPath: string;
  direction: 'payin' | 'payout';
  children: React.ReactNode;
  historyLabel?: string;
  modalTitle?: string;
  statusLabel?: (status: string) => string;
  changedByLabel?: string;
  emptyLabel?: string;
  closeLabel?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <StatusHistoryRow>
        {children}
        <IconButton
          label={historyLabel}
          variant="ghost"
          className="!min-h-8 !min-w-8 shrink-0 !p-1.5 text-text-muted hover:bg-bg-hover hover:text-text-primary"
          onClick={(e) => {
            e.stopPropagation();
            setOpen(true);
          }}
        >
          <History className="h-4 w-4" strokeWidth={2} />
        </IconButton>
      </StatusHistoryRow>
      <OrderStatusHistoryModal
        open={open}
        onClose={() => setOpen(false)}
        orderId={orderId}
        fetchPath={fetchPath}
        direction={direction}
        title={modalTitle}
        statusLabel={statusLabel}
        changedByLabel={changedByLabel}
        emptyLabel={emptyLabel}
        closeLabel={closeLabel}
      />
    </>
  );
}

function StatusHistoryRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="inline-flex max-w-full flex-row flex-nowrap items-center justify-center gap-1">
      {children}
    </div>
  );
}
