import { PayInOrderStatus } from '../enums';
import {
  PAYIN_IN_FLIGHT_STATUSES,
  PAYIN_PIPELINE_IN_FLIGHT_STATUSES,
  PAYIN_PRE_USDT_SETTLEMENT_STATUSES,
  PAYIN_REQUISITE_COMPLETED_STATUSES,
  PAYIN_REQUISITE_NONCOMPLETED_STATUSES,
  PAYIN_REQUISITE_SAME_AMOUNT_BLOCKING_STATUSES,
} from '../payin-volume';

describe('PAYIN_IN_FLIGHT_STATUSES', () => {
  it('includes open pay-in states and excludes PAID and CANCELED', () => {
    expect(PAYIN_IN_FLIGHT_STATUSES).toContain(PayInOrderStatus.NEW);
    expect(PAYIN_IN_FLIGHT_STATUSES).toContain(PayInOrderStatus.APPEAL);
    expect(PAYIN_IN_FLIGHT_STATUSES).toContain(PayInOrderStatus.UNDERPAID);
    expect(PAYIN_IN_FLIGHT_STATUSES).not.toContain(PayInOrderStatus.PAID);
    expect(PAYIN_IN_FLIGHT_STATUSES).not.toContain(PayInOrderStatus.CANCELED);
  });
});

describe('requisite volume breakdown status sets', () => {
  it('pipeline excludes terminal UNDER/OVER so they can count as completed', () => {
    expect(PAYIN_PIPELINE_IN_FLIGHT_STATUSES).not.toContain(PayInOrderStatus.UNDERPAID);
    expect(PAYIN_REQUISITE_COMPLETED_STATUSES).toContain(PayInOrderStatus.UNDERPAID);
    expect(PAYIN_REQUISITE_COMPLETED_STATUSES).toContain(PayInOrderStatus.PAID);
    expect(PAYIN_PIPELINE_IN_FLIGHT_STATUSES).toContain(PayInOrderStatus.NEW);
  });

  it('non-completed aggregate includes every non-released status (e.g. UPLOAD_FAILED)', () => {
    expect(PAYIN_REQUISITE_NONCOMPLETED_STATUSES).toContain(PayInOrderStatus.UPLOAD_FAILED);
    expect(PAYIN_REQUISITE_NONCOMPLETED_STATUSES).toContain(PayInOrderStatus.NO_REQUISITE);
    expect(PAYIN_REQUISITE_NONCOMPLETED_STATUSES).toContain(PayInOrderStatus.NEW);
    expect(PAYIN_REQUISITE_NONCOMPLETED_STATUSES).not.toContain(PayInOrderStatus.CANCELED);
    expect(PAYIN_REQUISITE_NONCOMPLETED_STATUSES).not.toContain(PayInOrderStatus.PAID);

    const all = Object.values(PayInOrderStatus) as PayInOrderStatus[];
    const covered = new Set([
      ...PAYIN_REQUISITE_COMPLETED_STATUSES,
      PayInOrderStatus.CANCELED,
      ...PAYIN_REQUISITE_NONCOMPLETED_STATUSES,
    ]);
    expect(all.every((s) => covered.has(s))).toBe(true);
  });
});

describe('PAYIN_REQUISITE_SAME_AMOUNT_BLOCKING_STATUSES', () => {
  it('blocks only NEW and VERIFIED on the same requisite', () => {
    expect(PAYIN_REQUISITE_SAME_AMOUNT_BLOCKING_STATUSES).toEqual([
      PayInOrderStatus.NEW,
      PayInOrderStatus.VERIFIED,
    ]);
    expect(PAYIN_REQUISITE_SAME_AMOUNT_BLOCKING_STATUSES).not.toContain(
      PayInOrderStatus.PENDING,
    );
    expect(PAYIN_REQUISITE_SAME_AMOUNT_BLOCKING_STATUSES).not.toContain(
      PayInOrderStatus.APPEAL,
    );
  });
});

describe('PAYIN_PRE_USDT_SETTLEMENT_STATUSES', () => {
  it('includes only states before USDT settlement debit is applied', () => {
    expect(PAYIN_PRE_USDT_SETTLEMENT_STATUSES).toEqual(
      expect.arrayContaining([
        PayInOrderStatus.PENDING,
        PayInOrderStatus.NEW,
        PayInOrderStatus.VERIFIED,
      ]),
    );
    expect(PAYIN_PRE_USDT_SETTLEMENT_STATUSES).not.toContain(PayInOrderStatus.PAID);
    expect(PAYIN_PRE_USDT_SETTLEMENT_STATUSES).not.toContain(PayInOrderStatus.UNDERPAID);
    expect(PAYIN_PRE_USDT_SETTLEMENT_STATUSES).not.toContain(PayInOrderStatus.APPEAL);
  });
});
