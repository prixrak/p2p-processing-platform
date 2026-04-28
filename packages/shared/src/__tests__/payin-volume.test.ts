import { PayInOrderStatus } from '../enums';
import { PAYIN_IN_FLIGHT_STATUSES } from '../payin-volume';

describe('PAYIN_IN_FLIGHT_STATUSES', () => {
  it('includes open pay-in states and excludes PAID and CANCELED', () => {
    expect(PAYIN_IN_FLIGHT_STATUSES).toContain(PayInOrderStatus.NEW);
    expect(PAYIN_IN_FLIGHT_STATUSES).toContain(PayInOrderStatus.APPEAL);
    expect(PAYIN_IN_FLIGHT_STATUSES).not.toContain(PayInOrderStatus.PAID);
    expect(PAYIN_IN_FLIGHT_STATUSES).not.toContain(PayInOrderStatus.CANCELED);
  });
});
