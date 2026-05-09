import { RequisiteType } from '../enums';
import { normalizeRequisiteIdentifier } from '../requisite-identity';

describe('normalizeRequisiteIdentifier', () => {
  it('strips non-digits for CARD', () => {
    expect(normalizeRequisiteIdentifier(RequisiteType.CARD, '1234 5678 9000 0000')).toBe(
      '1234567890000000',
    );
  });

  it('normalizes IBAN (spacing and case)', () => {
    expect(
      normalizeRequisiteIdentifier(RequisiteType.IBAN, 'ua21 3223 1300 0002 6007 2335 6611 1'),
    ).toBe('UA213223130000026007233566111');
  });
});
