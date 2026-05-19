import { PayinNoRequisiteReason } from '../enums';
import {
  isPayinNoRequisiteReason,
  payinNoRequisiteReasonMessage,
  PAYIN_NO_REQUISITE_REASON_MESSAGES,
} from '../payin-no-requisite';

describe('payin-no-requisite', () => {
  it('maps every reason to a non-empty English message', () => {
    for (const reason of Object.values(PayinNoRequisiteReason)) {
      const msg = PAYIN_NO_REQUISITE_REASON_MESSAGES[reason];
      expect(msg.length).toBeGreaterThan(10);
      expect(payinNoRequisiteReasonMessage(reason)).toBe(msg);
    }
  });

  it('falls back to generic message when reason is missing', () => {
    expect(payinNoRequisiteReasonMessage(null)).toContain('No active requisite');
    expect(isPayinNoRequisiteReason('INVALID')).toBe(false);
  });
});
