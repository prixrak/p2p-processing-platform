import {
  buildAppealPayinOrderSearchOr,
  buildPayinPayoutOrderSearchOr,
} from './order-search-where';

describe('buildPayinPayoutOrderSearchOr', () => {
  it('returns empty array for blank search', () => {
    expect(buildPayinPayoutOrderSearchOr('')).toEqual([]);
    expect(buildPayinPayoutOrderSearchOr('   ')).toEqual([]);
  });

  it('uses requestId contains for non-UUID fragments', () => {
    expect(buildPayinPayoutOrderSearchOr('123')).toEqual([
      { requestId: { contains: '123', mode: 'insensitive' } },
    ]);
  });

  it('prepends exact id match when term is a full UUID', () => {
    const id = '550e8400-e29b-41d4-a716-446655440000';
    expect(buildPayinPayoutOrderSearchOr(id)).toEqual([
      { id },
      { requestId: { contains: id, mode: 'insensitive' } },
    ]);
  });

  it('includes merchant name when requested', () => {
    expect(buildPayinPayoutOrderSearchOr('acme', { merchantNameContains: true })).toEqual([
      { requestId: { contains: 'acme', mode: 'insensitive' } },
      { merchant: { name: { contains: 'acme', mode: 'insensitive' } } },
    ]);
  });
});

describe('buildAppealPayinOrderSearchOr', () => {
  it('returns empty array for blank search', () => {
    expect(buildAppealPayinOrderSearchOr('')).toEqual([]);
  });

  it('uses nested payinOrder filters without invalid UUID contains', () => {
    expect(buildAppealPayinOrderSearchOr('xyz')).toEqual([
      { payinOrder: { requestId: { contains: 'xyz', mode: 'insensitive' } } },
      {
        payinOrder: {
          merchant: { name: { contains: 'xyz', mode: 'insensitive' } },
        },
      },
    ]);
  });

  it('prepends payinOrder id equals for full UUID', () => {
    const id = '550e8400-e29b-41d4-a716-446655440000';
    expect(buildAppealPayinOrderSearchOr(id)).toEqual([
      { payinOrder: { id } },
      { payinOrder: { requestId: { contains: id, mode: 'insensitive' } } },
      {
        payinOrder: {
          merchant: { name: { contains: id, mode: 'insensitive' } },
        },
      },
    ]);
  });
});
