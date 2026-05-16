import { opsSeverityMeetsMinimum } from './ops-alert-severity';

describe('opsSeverityMeetsMinimum', () => {
  it('accepts equal or higher severity vs minimum floor', () => {
    expect(opsSeverityMeetsMinimum('critical', 'high')).toBe(true);
    expect(opsSeverityMeetsMinimum('high', 'high')).toBe(true);
    expect(opsSeverityMeetsMinimum('medium', 'high')).toBe(false);
    expect(opsSeverityMeetsMinimum('low', 'critical')).toBe(false);
  });
});
