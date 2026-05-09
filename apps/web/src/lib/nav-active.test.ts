import { describe, expect, it } from 'vitest';
import { isNavHrefActive } from './nav-active';

describe('isNavHrefActive', () => {
  const root = '/owner';

  it('matches exact href', () => {
    expect(isNavHrefActive('/owner/cascade-requisites', '/owner/cascade-requisites', root)).toBe(
      true,
    );
  });

  it('does not treat hyphenated sibling as child of shorter href', () => {
    expect(isNavHrefActive('/owner/cascade-requisites', '/owner/cascade', root)).toBe(false);
  });

  it('matches nested path under href', () => {
    expect(isNavHrefActive('/owner/cascade/sub', '/owner/cascade', root)).toBe(true);
  });

  it('root href only matches exactly', () => {
    expect(isNavHrefActive('/owner', '/owner', root)).toBe(true);
    expect(isNavHrefActive('/owner/users', '/owner', root)).toBe(false);
  });
});
