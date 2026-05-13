import { PayInOrderStatus } from '../enums';
import {
  PAYIN_IN_FLIGHT_STATUSES,
  PAYIN_PIPELINE_IN_FLIGHT_STATUSES,
  PAYIN_REQUISITE_COMPLETED_STATUSES,
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
});
