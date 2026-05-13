import { describe, expect, it } from 'vitest';
import { PayInOrderStatus } from '@p2p/shared';
import { payinDeadlineElapsedShowsCanceled } from './payin-countdown-utils';

describe('payinDeadlineElapsedShowsCanceled', () => {
  it('returns false for non-canceled statuses', () => {
    expect(payinDeadlineElapsedShowsCanceled(PayInOrderStatus.NEW)).toBe(false);
    expect(payinDeadlineElapsedShowsCanceled(PayInOrderStatus.PENDING)).toBe(false);
    expect(payinDeadlineElapsedShowsCanceled(PayInOrderStatus.VERIFIED)).toBe(false);
  });

  it('returns true only for CANCELED', () => {
    expect(payinDeadlineElapsedShowsCanceled(PayInOrderStatus.CANCELED)).toBe(true);
  });

  it('returns false when status is undefined', () => {
    expect(payinDeadlineElapsedShowsCanceled(undefined)).toBe(false);
  });
});
