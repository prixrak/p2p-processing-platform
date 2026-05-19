import { AuditAction, AuditEntityType, type AuditEntityTypeValue } from '@p2p/shared';
import type { PrismaService } from '../../config/prisma.service';
import type { AuditService } from '../../modules/audit/audit.service';

export type OrderStatusHistoryRow = {
  action: string;
  createdAt: Date;
  actor: { email: string; role: string | null } | null;
  actorRole: string | null;
  oldValue: unknown;
  newValue: unknown;
};

export type OrderStatusHistoryEntry = {
  status: string;
  timestamp: Date;
  actor: string;
  note?: string | null;
};

function auditJsonPickString(v: unknown, key: string): string | null {
  if (typeof v !== 'object' || v === null || !(key in v)) return null;
  const o = v as Record<string, unknown>;
  const x = o[key];
  return x === undefined ? null : String(x);
}

function auditJsonPickStringNested(v: unknown, key: string): string | null {
  const direct = auditJsonPickString(v, key);
  if (direct !== null) return direct;
  if (typeof v !== 'object' || v === null) return null;
  const note = (v as Record<string, unknown>).note;
  return typeof note === 'string' && note.length > 0 ? note : null;
}

/** Human-readable actor for order status timeline (staff email or role label). */
export function formatOrderStatusHistoryActor(row: OrderStatusHistoryRow): string {
  if (row.actor?.email) return row.actor.email;
  const role = row.actorRole ?? row.actor?.role;
  if (!role) return 'System';
  switch (role.toUpperCase()) {
    case 'MERCHANT':
      return 'Merchant';
    case 'TRADER':
      return 'Trader';
    case 'ADMIN':
      return 'Admin';
    case 'OWNER':
      return 'Owner';
    case 'SUPPORT':
      return 'Support';
    case 'PAYOUT_TRADER':
      return 'Pay-Out specialist';
    default:
      return role;
  }
}

/** Map a single `ORDER_STATUS_CHANGED` audit row to a timeline entry (target status). */
export function mapOrderStatusHistoryRow(row: OrderStatusHistoryRow): OrderStatusHistoryEntry | null {
  if (row.action !== AuditAction.ORDER_STATUS_CHANGED) return null;

  const toStatus = auditJsonPickString(row.newValue, 'status');
  if (!toStatus) return null;

  const note = auditJsonPickStringNested(row.newValue, 'note');

  return {
    status: toStatus,
    timestamp: row.createdAt,
    actor: formatOrderStatusHistoryActor(row),
    note,
  };
}

const SYNTHETIC_INITIAL_FROM = '_CREATED_';

export async function fetchOrderStatusHistory(
  prisma: PrismaService,
  orderId: string,
  options?: { orderCreatedAt?: Date },
): Promise<OrderStatusHistoryEntry[]> {
  const rows = await prisma.auditLog.findMany({
    where: {
      entityId: orderId,
      action: AuditAction.ORDER_STATUS_CHANGED,
    },
    orderBy: { createdAt: 'asc' },
    select: {
      action: true,
      createdAt: true,
      actorRole: true,
      oldValue: true,
      newValue: true,
      actor: { select: { email: true, role: true } },
    },
  });

  const entries = rows
    .map((r) => mapOrderStatusHistoryRow(r as OrderStatusHistoryRow))
    .filter((e): e is OrderStatusHistoryEntry => e !== null);

  if (entries.length === 0) return entries;

  const firstRow = rows[0] as OrderStatusHistoryRow;
  const initialStatus = auditJsonPickString(firstRow.oldValue, 'status');
  if (
    !initialStatus ||
    initialStatus === SYNTHETIC_INITIAL_FROM ||
    initialStatus === entries[0].status
  ) {
    return entries;
  }

  const alreadyPresent = entries.some((e) => e.status === initialStatus);
  if (alreadyPresent) return entries;

  const initialEntry: OrderStatusHistoryEntry = {
    status: initialStatus,
    timestamp: options?.orderCreatedAt ?? firstRow.createdAt,
    actor: 'System',
  };

  return [initialEntry, ...entries];
}

export function withOrderStatusHistoryFallback(
  history: OrderStatusHistoryEntry[],
  fallback: { status: string; createdAt: Date; actor?: string },
): OrderStatusHistoryEntry[] {
  if (history.length > 0) return history;
  return [
    {
      status: fallback.status,
      timestamp: fallback.createdAt,
      actor: fallback.actor ?? 'System',
    },
  ];
}

/** Log the first status when an order row is created (merchant API / cascade). */
export function initialOrderStatusAuditFrom(
  createdStatus: string,
): { fromStatus: string; note: string } {
  return { fromStatus: SYNTHETIC_INITIAL_FROM, note: 'Order created' };
}

export async function recordOrderStatusChange(
  audit: AuditService,
  params: {
    entityType: AuditEntityTypeValue;
    orderId: string;
    fromStatus: string;
    toStatus: string;
    actorId?: string | null;
    actorRole?: string | null;
    note?: string | null;
  },
): Promise<void> {
  if (params.fromStatus === params.toStatus) return;

  await audit.log({
    actorId: params.actorId ?? null,
    actorRole: params.actorRole ?? null,
    action: AuditAction.ORDER_STATUS_CHANGED,
    entityType: params.entityType,
    entityId: params.orderId,
    oldValue: { status: params.fromStatus },
    newValue: {
      status: params.toStatus,
      ...(params.note ? { note: params.note } : {}),
    },
  });
}

export const OrderStatusHistoryEntity = {
  payin: AuditEntityType.PayinOrder,
  payout: AuditEntityType.PayoutOrder,
} as const;
