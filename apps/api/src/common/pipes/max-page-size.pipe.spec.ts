import { MaxPageSizePipe } from './max-page-size.pipe';
import { MAX_PAGE_SIZE } from '@p2p/shared';

describe('MaxPageSizePipe', () => {
  const pipe = new MaxPageSizePipe();

  it('clamps values above MAX_PAGE_SIZE', () => {
    expect(pipe.transform(MAX_PAGE_SIZE + 50)).toBe(MAX_PAGE_SIZE);
  });

  it('clamps values below 1', () => {
    expect(pipe.transform(0)).toBe(1);
    expect(pipe.transform(-5)).toBe(1);
  });

  it('passes through in-range values', () => {
    expect(pipe.transform(10)).toBe(10);
    expect(pipe.transform(MAX_PAGE_SIZE)).toBe(MAX_PAGE_SIZE);
  });
});
