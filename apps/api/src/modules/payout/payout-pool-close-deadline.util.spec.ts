import { PayoutPoolType } from '@prisma/client';
import { computePayoutPoolCloseDeadline } from './payout-pool-close-deadline.util';

describe('computePayoutPoolCloseDeadline', () => {
  const createdAt = new Date('2026-05-01T12:00:00.000Z');
  const poolAssignedAt = new Date('2026-05-01T14:00:00.000Z');

  it('returns null when timeout is disabled', () => {
    expect(
      computePayoutPoolCloseDeadline({
        poolType: PayoutPoolType.STANDARD,
        createdAt,
        poolAssignedAt: null,
        poolTimeoutEnabled: false,
        poolTimeoutHours: 24,
      }),
    ).toBeNull();
  });

  it('returns null when hours unset or invalid', () => {
    expect(
      computePayoutPoolCloseDeadline({
        poolType: PayoutPoolType.STANDARD,
        createdAt,
        poolAssignedAt: null,
        poolTimeoutEnabled: true,
        poolTimeoutHours: null,
      }),
    ).toBeNull();
    expect(
      computePayoutPoolCloseDeadline({
        poolType: PayoutPoolType.STANDARD,
        createdAt,
        poolAssignedAt: null,
        poolTimeoutEnabled: true,
        poolTimeoutHours: 0,
      }),
    ).toBeNull();
  });

  it('anchors STANDARD pool to createdAt', () => {
    const d = computePayoutPoolCloseDeadline({
      poolType: PayoutPoolType.STANDARD,
      createdAt,
      poolAssignedAt,
      poolTimeoutEnabled: true,
      poolTimeoutHours: 2,
    });
    expect(d?.toISOString()).toBe('2026-05-01T14:00:00.000Z');
  });

  it('anchors PAYOUT_SPECIALIST pool to poolAssignedAt when set', () => {
    const d = computePayoutPoolCloseDeadline({
      poolType: PayoutPoolType.PAYOUT_SPECIALIST,
      createdAt,
      poolAssignedAt,
      poolTimeoutEnabled: true,
      poolTimeoutHours: 1,
    });
    expect(d?.toISOString()).toBe('2026-05-01T15:00:00.000Z');
  });

  it('falls back to createdAt for PAYOUT_SPECIALIST when poolAssignedAt is null', () => {
    const d = computePayoutPoolCloseDeadline({
      poolType: PayoutPoolType.PAYOUT_SPECIALIST,
      createdAt,
      poolAssignedAt: null,
      poolTimeoutEnabled: true,
      poolTimeoutHours: 3,
    });
    expect(d?.toISOString()).toBe('2026-05-01T15:00:00.000Z');
  });
});
