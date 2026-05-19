import { AuditAction } from '@p2p/shared';
import {
  formatOrderStatusHistoryActor,
  mapOrderStatusHistoryRow,
} from './order-status-history';

describe('order-status-history', () => {
  it('maps ORDER_STATUS_CHANGED to target status timeline entry', () => {
    const at = new Date('2026-05-16T18:35:09.000Z');
    expect(
      mapOrderStatusHistoryRow({
        action: AuditAction.ORDER_STATUS_CHANGED,
        createdAt: at,
        actor: { email: 'merchant@example.com', role: 'MERCHANT' },
        actorRole: 'MERCHANT',
        oldValue: { status: 'NEW' },
        newValue: { status: 'VERIFIED', note: 'Client confirmed order' },
      }),
    ).toEqual({
      status: 'VERIFIED',
      timestamp: at,
      actor: 'merchant@example.com',
      note: 'Client confirmed order',
    });
  });

  it('ignores non status-change audit actions', () => {
    expect(
      mapOrderStatusHistoryRow({
        action: 'PAYOUT_COMPLETION_PROOF_DETACHED',
        createdAt: new Date(),
        actor: null,
        actorRole: null,
        oldValue: null,
        newValue: null,
      }),
    ).toBeNull();
  });

  it('formats actor from role when email is missing', () => {
    expect(
      formatOrderStatusHistoryActor({
        action: AuditAction.ORDER_STATUS_CHANGED,
        createdAt: new Date(),
        actor: null,
        actorRole: 'TRADER',
        oldValue: null,
        newValue: null,
      }),
    ).toBe('Trader');
  });
});

describe('fetchOrderStatusHistory reconstruction', () => {
  it('prepends initial status from first audit oldValue when building timeline', async () => {
    const createdAt = new Date('2026-05-19T08:00:00.000Z');
    const paidAt = new Date('2026-05-19T10:58:10.000Z');

    const prisma = {
      auditLog: {
        findMany: jest.fn().mockResolvedValue([
          {
            action: AuditAction.ORDER_STATUS_CHANGED,
            createdAt: paidAt,
            actorRole: 'TRADER',
            oldValue: { status: 'VERIFIED' },
            newValue: { status: 'PAID' },
            actor: { email: 'trader@example.com', role: 'TRADER' },
          },
        ]),
      },
    };

    const { fetchOrderStatusHistory } = await import('./order-status-history');
    const entries = await fetchOrderStatusHistory(prisma as never, 'order-1', {
      orderCreatedAt: createdAt,
    });

    expect(entries).toHaveLength(2);
    expect(entries[0]).toEqual({
      status: 'VERIFIED',
      timestamp: createdAt,
      actor: 'System',
    });
    expect(entries[1].status).toBe('PAID');
    expect(entries[1].actor).toBe('trader@example.com');
  });
});
