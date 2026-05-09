import { describe, expect, it } from 'vitest';
import { PayInOrderStatus } from '@p2p/shared';
import { payinDeadlineElapsedShowsCanceled } from './payin-countdown-utils';

describe('payinDeadlineElapsedShowsCanceled', () => {
  it('returns false while time remains', () => {
    expect(
      payinDeadlineElapsedShowsCanceled({
        remainingMs: 1000,
        status: PayInOrderStatus.NEW,
      }),
    ).toBe(false);
  });

  it('returns true for CANCELED even when time would still be left on the clock', () => {
    expect(
      payinDeadlineElapsedShowsCanceled({
        remainingMs: 60_000,
        status: PayInOrderStatus.CANCELED,
      }),
    ).toBe(true);
  });

  it('returns true when elapsed and status is NEW or PENDING', () => {
    expect(
      payinDeadlineElapsedShowsCanceled({
        remainingMs: 0,
        status: PayInOrderStatus.NEW,
      }),
    ).toBe(true);
    expect(
      payinDeadlineElapsedShowsCanceled({
        remainingMs: -1,
        status: PayInOrderStatus.PENDING,
      }),
    ).toBe(true);
  });

  it('returns false when elapsed but status is VERIFIED (not auto-closed by timer)', () => {
    expect(
      payinDeadlineElapsedShowsCanceled({
        remainingMs: 0,
        status: PayInOrderStatus.VERIFIED,
      }),
    ).toBe(false);
  });

  it('defaults unknown status to canceled display when elapsed', () => {
    expect(payinDeadlineElapsedShowsCanceled({ remainingMs: 0, status: undefined })).toBe(true);
  });
});
