import { describe, expect, it } from 'vitest';
import { remainingFromLimitAndConsumed, volumePart } from './utils';

describe('remainingFromLimitAndConsumed', () => {
  it('subtracts consumed completed and processing from limit', () => {
    expect(remainingFromLimitAndConsumed(500_000, 74_338 + 2_171)).toBe(423_491);
  });

  it('treats non-finite consumed as zero', () => {
    expect(remainingFromLimitAndConsumed(100, Number.NaN)).toBe(100);
    expect(remainingFromLimitAndConsumed(100, Number(undefined as unknown as number))).toBe(100);
  });

  it('never goes negative', () => {
    expect(remainingFromLimitAndConsumed(100, 150)).toBe(0);
  });

  it('returns 0 for non-positive limit', () => {
    expect(remainingFromLimitAndConsumed(0, 10)).toBe(0);
    expect(remainingFromLimitAndConsumed(Number.NaN, 10)).toBe(0);
  });
});

describe('volumePart', () => {
  it('returns 0 for undefined and NaN', () => {
    expect(volumePart(undefined)).toBe(0);
    expect(volumePart(Number.NaN)).toBe(0);
  });

  it('returns non-negative numbers', () => {
    expect(volumePart(5)).toBe(5);
    expect(volumePart(-1)).toBe(0);
  });
});
