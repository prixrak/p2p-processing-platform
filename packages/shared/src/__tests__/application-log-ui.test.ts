import {
  ApplicationLogUiStatus,
  mapPayinToApplicationLogUiStatus,
  mapPayoutToApplicationLogUiStatus,
  resolvePayinApplicationLogErrorCode,
  resolvePayoutApplicationLogErrorCode,
  applicationLogErrorMessage,
} from '../application-log-ui';
import {
  PayInOrderStatus,
  PayOutOrderStatus,
  PayinNoRequisiteReason,
  PayoutTraderRejectReason,
} from '../enums';

describe('application-log-ui', () => {
  describe('mapPayinToApplicationLogUiStatus', () => {
    it('maps NO_REQUISITE to ERROR regardless of trader', () => {
      expect(mapPayinToApplicationLogUiStatus(PayInOrderStatus.NO_REQUISITE, null)).toBe(
        ApplicationLogUiStatus.ERROR,
      );
    });

    it('maps UPLOAD_FAILED to ERROR', () => {
      expect(mapPayinToApplicationLogUiStatus(PayInOrderStatus.UPLOAD_FAILED, null)).toBe(
        ApplicationLogUiStatus.ERROR,
      );
    });

    it('maps NEW with trader to SUCCESS', () => {
      expect(mapPayinToApplicationLogUiStatus(PayInOrderStatus.NEW, 'trader-uuid')).toBe(
        ApplicationLogUiStatus.SUCCESS,
      );
    });

    it('maps PENDING without trader to PENDING', () => {
      expect(mapPayinToApplicationLogUiStatus(PayInOrderStatus.PENDING, null)).toBe(
        ApplicationLogUiStatus.PENDING,
      );
    });
  });

  describe('mapPayoutToApplicationLogUiStatus', () => {
    it('maps COMPLETED to SUCCESS', () => {
      expect(mapPayoutToApplicationLogUiStatus(PayOutOrderStatus.COMPLETED)).toBe(
        ApplicationLogUiStatus.SUCCESS,
      );
    });

    it('maps FAILED to ERROR', () => {
      expect(mapPayoutToApplicationLogUiStatus(PayOutOrderStatus.FAILED)).toBe(
        ApplicationLogUiStatus.ERROR,
      );
    });

    it('maps PENDING to PENDING', () => {
      expect(mapPayoutToApplicationLogUiStatus(PayOutOrderStatus.PENDING)).toBe(
        ApplicationLogUiStatus.PENDING,
      );
    });
  });

  describe('error codes', () => {
    it('resolves pay-in codes', () => {
      expect(resolvePayinApplicationLogErrorCode(PayInOrderStatus.NO_REQUISITE)).toBe(
        'NO_REQUISITE',
      );
      expect(
        resolvePayinApplicationLogErrorCode(
          PayInOrderStatus.NO_REQUISITE,
          PayinNoRequisiteReason.USDT_CAPACITY_INSUFFICIENT,
        ),
      ).toBe(PayinNoRequisiteReason.USDT_CAPACITY_INSUFFICIENT);
      expect(resolvePayinApplicationLogErrorCode(PayInOrderStatus.NEW)).toBeNull();
    });

    it('resolves payout FAILED with trader reject reason', () => {
      expect(
        resolvePayoutApplicationLogErrorCode(PayOutOrderStatus.FAILED, null),
      ).toBe('FAILED');
      expect(
        resolvePayoutApplicationLogErrorCode(
          PayOutOrderStatus.FAILED,
          PayoutTraderRejectReason.FOREIGN_CARD,
        ),
      ).toBe('FOREIGN_CARD');
    });

    it('returns English messages', () => {
      expect(applicationLogErrorMessage('PAYIN', PayInOrderStatus.NO_REQUISITE)).toContain(
        'No active requisite',
      );
      expect(
        applicationLogErrorMessage(
          'PAYIN',
          PayInOrderStatus.NO_REQUISITE,
          undefined,
          PayinNoRequisiteReason.NO_ACTIVE_REQUISITES,
        ),
      ).toContain('No active trader requisites');
      expect(
        applicationLogErrorMessage(
          'PAYOUT',
          PayOutOrderStatus.FAILED,
          PayoutTraderRejectReason.OTHER,
        ),
      ).toContain('other reason');
    });
  });
});
