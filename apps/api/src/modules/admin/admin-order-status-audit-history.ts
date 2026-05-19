import type { OrderStatusHistoryRow } from '../../common/order-status-history/order-status-history';
import {
  formatOrderStatusHistoryActor,
  mapOrderStatusHistoryRow,
} from '../../common/order-status-history/order-status-history';

export type AdminAuditStatusHistoryRow = OrderStatusHistoryRow;

/** Map `audit_logs` rows to timeline entries for owner/admin order detail. */
export function mapAuditRowToAdminStatusHistory(l: AdminAuditStatusHistoryRow): {
  status: string;
  timestamp: Date;
  actor: string;
  note?: string | null;
} {
  const mapped = mapOrderStatusHistoryRow(l);
  if (mapped) {
    return {
      status: mapped.status,
      timestamp: mapped.timestamp,
      actor: mapped.actor,
      ...(mapped.note ? { note: mapped.note } : {}),
    };
  }
  return {
    status: l.action,
    timestamp: l.createdAt,
    actor: formatOrderStatusHistoryActor(l),
  };
}
