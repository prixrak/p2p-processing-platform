'use client';

import { StatusBadge } from '@/components/ui/badge';
import { OrderStatusColumnWithHistory } from '@/components/ui/order-status-column-with-history';
import { internalPaths } from '@/lib/internal-api';
import { payinStatusLabel, payoutStatusLabel } from '@/lib/order-status-ui';

export function StaffOrderStatusCell({
  orderId,
  status,
  direction,
  fetchPath,
}: {
  orderId: string;
  status: string;
  direction: 'payin' | 'payout';
  /** When set, overrides default admin/support status-history URL (e.g. owner uses admin API). */
  fetchPath?: string;
}) {
  const historyPath =
    fetchPath ??
    (direction === 'payin'
      ? internalPaths.adminOrderStatusHistory(orderId, 'PAYIN')
      : internalPaths.adminOrderStatusHistory(orderId, 'PAYOUT'));

  const statusLabel = direction === 'payin' ? payinStatusLabel : payoutStatusLabel;

  return (
    <OrderStatusColumnWithHistory
      orderId={orderId}
      fetchPath={historyPath}
      direction={direction}
      statusLabel={statusLabel}
    >
      <StatusBadge status={status} />
    </OrderStatusColumnWithHistory>
  );
}

export function SupportOrderStatusCell({
  orderId,
  status,
  direction,
}: {
  orderId: string;
  status: string;
  direction: 'payin' | 'payout';
}) {
  const historyPath =
    direction === 'payin'
      ? internalPaths.supportOrderStatusHistory(orderId, 'PAYIN')
      : internalPaths.supportOrderStatusHistory(orderId, 'PAYOUT');

  return (
    <StaffOrderStatusCell
      orderId={orderId}
      status={status}
      direction={direction}
      fetchPath={historyPath}
    />
  );
}
