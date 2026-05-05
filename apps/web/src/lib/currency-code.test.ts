import { describe, expect, it } from 'vitest';
import { currencyCodeFromUnknown } from './currency-code';

describe('currencyCodeFromUnknown', () => {
  it('returns trimmed string codes', () => {
    expect(currencyCodeFromUnknown(' uah ')).toBe('uah');
    expect(currencyCodeFromUnknown('USDT')).toBe('USDT');
  });

  it('extracts code from nested relation objects', () => {
    expect(currencyCodeFromUnknown({ code: 'UAH' })).toBe('UAH');
    expect(currencyCodeFromUnknown({ code: ' usdt ' })).toBe('usdt');
  });

  it('returns empty string for unsupported shapes', () => {
    expect(currencyCodeFromUnknown(null)).toBe('');
    expect(currencyCodeFromUnknown(undefined)).toBe('');
    expect(currencyCodeFromUnknown({})).toBe('');
    expect(currencyCodeFromUnknown({ code: 1 })).toBe('');
  });
});
