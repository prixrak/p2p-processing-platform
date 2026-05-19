import { AuditAction } from '@p2p/shared';
import { mapAuditRowToAdminStatusHistory } from './admin-order-status-audit-history';

describe('mapAuditRowToAdminStatusHistory', () => {
  const t0 = new Date('2026-05-18T12:00:00.000Z');

  it('formats ORDER_STATUS_CHANGED with target status', () => {
    expect(
      mapAuditRowToAdminStatusHistory({
        action: AuditAction.ORDER_STATUS_CHANGED,
        createdAt: t0,
        actor: { email: 'owner@example.com', role: 'OWNER' },
        actorRole: 'OWNER',
        oldValue: { status: 'NEW' },
        newValue: { status: 'APPEAL' },
      }),
    ).toEqual({
      status: 'APPEAL',
      timestamp: t0,
      actor: 'owner@example.com',
    });
  });

  it('falls back to action label when payloads are absent', () => {
    expect(
      mapAuditRowToAdminStatusHistory({
        action: AuditAction.CREATE,
        createdAt: t0,
        actor: null,
        actorRole: null,
        oldValue: null,
        newValue: null,
      }),
    ).toEqual({
      status: 'CREATE',
      timestamp: t0,
      actor: 'System',
    });
  });

  it('falls back when ORDER_STATUS_CHANGED has no recognizable status JSON', () => {
    expect(
      mapAuditRowToAdminStatusHistory({
        action: AuditAction.ORDER_STATUS_CHANGED,
        createdAt: t0,
        actor: { email: 'a@test.com', role: 'ADMIN' },
        actorRole: 'ADMIN',
        oldValue: {},
        newValue: {},
      }),
    ).toEqual({
      status: AuditAction.ORDER_STATUS_CHANGED,
      timestamp: t0,
      actor: 'a@test.com',
    });
  });
});
