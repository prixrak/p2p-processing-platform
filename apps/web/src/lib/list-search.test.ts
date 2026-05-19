import { describe, expect, it } from 'vitest';
import { listSearchForQuery } from './list-search';

describe('listSearchForQuery', () => {
  it('returns undefined for blank or single-character input', () => {
    expect(listSearchForQuery('')).toBeUndefined();
    expect(listSearchForQuery('  ')).toBeUndefined();
    expect(listSearchForQuery('a')).toBeUndefined();
  });

  it('allows two+ characters and uuid-like fragments', () => {
    expect(listSearchForQuery('ab')).toBe('ab');
    expect(listSearchForQuery('550e8400')).toBe('550e8400');
    expect(listSearchForQuery('550e8400-e29b-41d4-a716-446655440000')).toBe(
      '550e8400-e29b-41d4-a716-446655440000',
    );
  });
});
