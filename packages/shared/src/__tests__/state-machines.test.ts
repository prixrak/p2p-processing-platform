import { PayInOrderStatus, PayOutOrderStatus } from '../enums';
import {
  isValidPayInTransition,
  isValidPayOutTransition,
  PAYIN_TRANSITIONS,
  PAYOUT_TRANSITIONS,
} from '../state-machines';

const ALL_PAY_IN_STATUSES = Object.values(PayInOrderStatus) as PayInOrderStatus[];
const ALL_PAY_OUT_STATUSES = Object.values(PayOutOrderStatus) as PayOutOrderStatus[];

describe('PAYIN_TRANSITIONS', () => {
  it('defines outbound transitions for every PayInOrderStatus', () => {
    for (const status of ALL_PAY_IN_STATUSES) {
      expect(PAYIN_TRANSITIONS).toHaveProperty(status);
      expect(Array.isArray(PAYIN_TRANSITIONS[status])).toBe(true);
    }
  });

  it('marks every edge in the table as a valid transition', () => {
    for (const [from, targets] of Object.entries(PAYIN_TRANSITIONS) as [
      PayInOrderStatus,
      PayInOrderStatus[],
    ][]) {
      for (const to of targets) {
        expect(isValidPayInTransition(from, to)).toBe(true);
      }
    }
  });

  it('rejects transitions not listed for that source state', () => {
    for (const from of ALL_PAY_IN_STATUSES) {
      const allowed = new Set(PAYIN_TRANSITIONS[from]);
      for (const to of ALL_PAY_IN_STATUSES) {
        expect(isValidPayInTransition(from, to)).toBe(allowed.has(to));
      }
    }
  });

  it('rejects self-transitions unless explicitly allowed', () => {
    for (const status of ALL_PAY_IN_STATUSES) {
      const allowed = PAYIN_TRANSITIONS[status];
      expect(isValidPayInTransition(status, status)).toBe(allowed.includes(status));
    }
  });
});

describe('PAYOUT_TRANSITIONS', () => {
  it('defines outbound transitions for every PayOutOrderStatus', () => {
    for (const status of ALL_PAY_OUT_STATUSES) {
      expect(PAYOUT_TRANSITIONS).toHaveProperty(status);
      expect(Array.isArray(PAYOUT_TRANSITIONS[status])).toBe(true);
    }
  });

  it('marks every edge in the table as a valid transition', () => {
    for (const [from, targets] of Object.entries(PAYOUT_TRANSITIONS) as [
      PayOutOrderStatus,
      PayOutOrderStatus[],
    ][]) {
      for (const to of targets) {
        expect(isValidPayOutTransition(from, to)).toBe(true);
      }
    }
  });

  it('rejects transitions not listed for that source state', () => {
    for (const from of ALL_PAY_OUT_STATUSES) {
      const allowed = new Set(PAYOUT_TRANSITIONS[from]);
      for (const to of ALL_PAY_OUT_STATUSES) {
        expect(isValidPayOutTransition(from, to)).toBe(allowed.has(to));
      }
    }
  });
});

describe('terminal states (no outbound transitions)', () => {
  const payInTerminal = ALL_PAY_IN_STATUSES.filter((s) => PAYIN_TRANSITIONS[s].length === 0);
  const payOutTerminal = ALL_PAY_OUT_STATUSES.filter((s) => PAYOUT_TRANSITIONS[s].length === 0);

  it('Pay-In: only UPLOAD_FAILED is terminal in the transition graph', () => {
    expect([...payInTerminal].sort()).toEqual([PayInOrderStatus.UPLOAD_FAILED].sort());
  });

  it('Pay-In terminal states reject transition to any Pay-In status', () => {
    for (const from of payInTerminal) {
      for (const to of ALL_PAY_IN_STATUSES) {
        expect(isValidPayInTransition(from, to)).toBe(false);
      }
    }
  });

  it('Pay-Out: COMPLETED, FAILED, and UPLOAD_FAILED are terminal', () => {
    expect([...payOutTerminal].sort()).toEqual(
      [
        PayOutOrderStatus.COMPLETED,
        PayOutOrderStatus.FAILED,
        PayOutOrderStatus.UPLOAD_FAILED,
      ].sort(),
    );
  });

  it('Pay-Out terminal states reject transition to any Pay-Out status', () => {
    for (const from of payOutTerminal) {
      for (const to of ALL_PAY_OUT_STATUSES) {
        expect(isValidPayOutTransition(from, to)).toBe(false);
      }
    }
  });

  it('Pay-Out COMPLETED and FAILED have no outbound transitions', () => {
    expect(PAYOUT_TRANSITIONS[PayOutOrderStatus.COMPLETED]).toEqual([]);
    expect(PAYOUT_TRANSITIONS[PayOutOrderStatus.FAILED]).toEqual([]);
  });
});

describe('isValidPayInTransition', () => {
  it('returns false when source is not a known key (runtime guard)', () => {
    expect(isValidPayInTransition('UNKNOWN' as PayInOrderStatus, PayInOrderStatus.NEW)).toBe(
      false,
    );
  });

  it('matches PAYIN_TRANSITIONS for sample valid paths', () => {
    expect(isValidPayInTransition(PayInOrderStatus.PENDING, PayInOrderStatus.NEW)).toBe(true);
    expect(isValidPayInTransition(PayInOrderStatus.PENDING, PayInOrderStatus.PAID)).toBe(true);
    expect(isValidPayInTransition(PayInOrderStatus.PENDING, PayInOrderStatus.CANCELED)).toBe(true);
    expect(isValidPayInTransition(PayInOrderStatus.NEW, PayInOrderStatus.VERIFIED)).toBe(true);
    expect(isValidPayInTransition(PayInOrderStatus.NEW, PayInOrderStatus.PAID)).toBe(true);
    expect(isValidPayInTransition(PayInOrderStatus.NEW, PayInOrderStatus.APPEAL)).toBe(true);
    expect(isValidPayInTransition(PayInOrderStatus.VERIFIED, PayInOrderStatus.PAID)).toBe(true);
    expect(isValidPayInTransition(PayInOrderStatus.CANCELED, PayInOrderStatus.PAID)).toBe(true);
    expect(isValidPayInTransition(PayInOrderStatus.APPEAL, PayInOrderStatus.PAID)).toBe(true);
  });

  it('matches PAYIN_TRANSITIONS for sample invalid paths', () => {
    expect(isValidPayInTransition(PayInOrderStatus.PENDING, PayInOrderStatus.VERIFIED)).toBe(
      false,
    );
    expect(isValidPayInTransition(PayInOrderStatus.APPEAL, PayInOrderStatus.NEW)).toBe(false);
    expect(isValidPayInTransition(PayInOrderStatus.NO_REQUISITE, PayInOrderStatus.CANCELED)).toBe(
      true,
    );
  });
});

describe('isValidPayOutTransition', () => {
  it('returns false when source is not a known key (runtime guard)', () => {
    expect(
      isValidPayOutTransition('UNKNOWN' as PayOutOrderStatus, PayOutOrderStatus.NEW),
    ).toBe(false);
  });

  it('matches PAYOUT_TRANSITIONS for sample valid paths', () => {
    expect(isValidPayOutTransition(PayOutOrderStatus.PENDING, PayOutOrderStatus.NEW)).toBe(true);
    expect(isValidPayOutTransition(PayOutOrderStatus.PENDING, PayOutOrderStatus.PROCESSING)).toBe(
      true,
    );
    expect(isValidPayOutTransition(PayOutOrderStatus.NEW, PayOutOrderStatus.PROCESSING)).toBe(
      true,
    );
    expect(isValidPayOutTransition(PayOutOrderStatus.NEW, PayOutOrderStatus.PENDING)).toBe(true);
    expect(
      isValidPayOutTransition(PayOutOrderStatus.PROCESSING, PayOutOrderStatus.COMPLETED),
    ).toBe(true);
    expect(isValidPayOutTransition(PayOutOrderStatus.PROCESSING, PayOutOrderStatus.FAILED)).toBe(
      true,
    );
    expect(isValidPayOutTransition(PayOutOrderStatus.PROCESSING, PayOutOrderStatus.PENDING)).toBe(
      true,
    );
  });

  it('matches PAYOUT_TRANSITIONS for sample invalid paths', () => {
    expect(isValidPayOutTransition(PayOutOrderStatus.PENDING, PayOutOrderStatus.COMPLETED)).toBe(
      false,
    );
    expect(isValidPayOutTransition(PayOutOrderStatus.NEW, PayOutOrderStatus.COMPLETED)).toBe(
      false,
    );
    expect(isValidPayOutTransition(PayOutOrderStatus.COMPLETED, PayOutOrderStatus.NEW)).toBe(
      false,
    );
  });
});

describe('Pay-In non-terminal “resolved” statuses still allow APPEAL', () => {
  it('PAID, UNDERPAID, and OVERPAID can move to APPEAL only', () => {
    for (const from of [
      PayInOrderStatus.PAID,
      PayInOrderStatus.UNDERPAID,
      PayInOrderStatus.OVERPAID,
    ]) {
      expect(PAYIN_TRANSITIONS[from]).toEqual([PayInOrderStatus.APPEAL]);
      expect(isValidPayInTransition(from, PayInOrderStatus.APPEAL)).toBe(true);
      for (const to of ALL_PAY_IN_STATUSES) {
        if (to !== PayInOrderStatus.APPEAL) {
          expect(isValidPayInTransition(from, to)).toBe(false);
        }
      }
    }
  });

  it('CANCELED can move to APPEAL or to paid outcomes (PAID / UNDERPAID / OVERPAID)', () => {
    const from = PayInOrderStatus.CANCELED;
    expect(new Set(PAYIN_TRANSITIONS[from])).toEqual(
      new Set([
        PayInOrderStatus.APPEAL,
        PayInOrderStatus.PAID,
        PayInOrderStatus.UNDERPAID,
        PayInOrderStatus.OVERPAID,
      ]),
    );
    for (const to of [
      PayInOrderStatus.APPEAL,
      PayInOrderStatus.PAID,
      PayInOrderStatus.UNDERPAID,
      PayInOrderStatus.OVERPAID,
    ]) {
      expect(isValidPayInTransition(from, to)).toBe(true);
    }
    for (const to of ALL_PAY_IN_STATUSES) {
      if (
        to !== PayInOrderStatus.APPEAL &&
        to !== PayInOrderStatus.PAID &&
        to !== PayInOrderStatus.UNDERPAID &&
        to !== PayInOrderStatus.OVERPAID
      ) {
        expect(isValidPayInTransition(from, to)).toBe(false);
      }
    }
  });
});
