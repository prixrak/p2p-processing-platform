import { AuditAction } from '@p2p/shared';

export type AdminAuditStatusHistoryRow = {
  action: string;
  createdAt: Date;
  actor: { email: string } | null;
  oldValue: unknown;
  newValue: unknown;
};

function auditJsonPickString(v: unknown, key: string): string | null {
  if (typeof v !== 'object' || v === null || !(key in v)) return null;
  const o = v as Record<string, unknown>;
  const x = o[key];
  return x === undefined ? null : String(x);
}

/** Map `audit_logs` rows to timeline entries for owner/admin order detail. */
export function mapAuditRowToAdminStatusHistory(l: AdminAuditStatusHistoryRow): {
  status: string;
  timestamp: Date;
  actor: string;
} {
  if (l.action === AuditAction.ORDER_STATUS_CHANGED) {
    const fromStatus = auditJsonPickString(l.oldValue, 'status');
    const toStatus = auditJsonPickString(l.newValue, 'status');
    if (fromStatus !== null || toStatus !== null) {
      return {
        status: `${fromStatus ?? '?'} → ${toStatus ?? '?'}`,
        timestamp: l.createdAt,
        actor: l.actor?.email ?? 'system',
      };
    }
  }
  return {
    status: l.action,
    timestamp: l.createdAt,
    actor: l.actor?.email ?? 'system',
  };
}
