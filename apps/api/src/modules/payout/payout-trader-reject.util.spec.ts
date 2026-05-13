import { PayoutTraderRejectReason } from '@p2p/shared';
import {
  parsePayoutTraderRejectBody,
  PayoutTraderRejectPayloadError,
  resolvePayoutRejectReasonFromDto,
} from './payout-trader-reject.util';

describe('payout-trader-reject.util', () => {
  describe('resolvePayoutRejectReasonFromDto', () => {
    it('defaults missing reason to OTHER', () => {
      expect(resolvePayoutRejectReasonFromDto(undefined)).toBe(PayoutTraderRejectReason.OTHER);
    });

    it('preserves structured codes', () => {
      expect(resolvePayoutRejectReasonFromDto(PayoutTraderRejectReason.FOREIGN_CARD)).toBe(
        PayoutTraderRejectReason.FOREIGN_CARD,
      );
      expect(
        resolvePayoutRejectReasonFromDto(PayoutTraderRejectReason.CARD_REFUND_IN_PROGRESS),
      ).toBe(PayoutTraderRejectReason.CARD_REFUND_IN_PROGRESS);
    });
  });

  describe('parsePayoutTraderRejectBody', () => {
    it('requires non-empty note for OTHER', () => {
      expect(() =>
        parsePayoutTraderRejectBody({ reason: PayoutTraderRejectReason.OTHER, reason_other_note: ' ' }),
      ).toThrow(PayoutTraderRejectPayloadError);
      expect(() => parsePayoutTraderRejectBody({})).toThrow(PayoutTraderRejectPayloadError);
    });

    it('accepts OTHER with trimmed note', () => {
      expect(
        parsePayoutTraderRejectBody({
          reason: PayoutTraderRejectReason.OTHER,
          reason_other_note: '  fraud suspicion  ',
        }),
      ).toEqual({
        reason: PayoutTraderRejectReason.OTHER,
        otherNote: 'fraud suspicion',
      });
    });

    it('ignores note for non-OTHER reasons', () => {
      expect(
        parsePayoutTraderRejectBody({
          reason: PayoutTraderRejectReason.FOREIGN_CARD,
          reason_other_note: 'ignored',
        }),
      ).toEqual({
        reason: PayoutTraderRejectReason.FOREIGN_CARD,
        otherNote: null,
      });
    });
  });
});
