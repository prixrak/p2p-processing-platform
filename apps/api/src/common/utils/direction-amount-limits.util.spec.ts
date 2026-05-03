import { BadRequestException } from '@nestjs/common';
import { assertAmountWithinDirectionMinMax } from './direction-amount-limits.util';

describe('assertAmountWithinDirectionMinMax', () => {
  it('allows any positive amount when min and max are 0', () => {
    expect(() =>
      assertAmountWithinDirectionMinMax(600, 'UAH', 0, 0, 'platform Pay-In direction'),
    ).not.toThrow();
  });

  it('rejects below minimum', () => {
    expect(() =>
      assertAmountWithinDirectionMinMax(600, 'UAH', 1000, 0, 'platform Pay-In direction'),
    ).toThrow(BadRequestException);
  });

  it('rejects above maximum', () => {
    expect(() =>
      assertAmountWithinDirectionMinMax(2000, 'UAH', 0, 1500, 'platform Pay-In direction'),
    ).toThrow(BadRequestException);
  });
});
