import { describe, expect, it } from 'vitest';
import { listSearchForQuery, textMatchesListSearch } from './list-search';

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

describe('textMatchesListSearch', () => {
  it('matches formatted card queries against digit-only stored values', () => {
    expect(textMatchesListSearch('5375 4112', '5375411234567890')).toBe(true);
  });

  it('matches digit-only queries against formatted stored values', () => {
    expect(textMatchesListSearch('53754112', '5375 4112 3456 7890')).toBe(true);
  });
});
