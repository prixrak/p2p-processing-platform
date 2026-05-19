import {
  buildAppealListSearchOr,
  buildAppealPayinOrderSearchOr,
  buildPayinOrderSearchOr,
  buildPayoutOrderSearchOr,
  normalizeOrderListSearch,
  orderListSearchVariants,
} from './order-search-where';

describe('normalizeOrderListSearch', () => {
  it('drops single-character terms', () => {
    expect(normalizeOrderListSearch('a')).toBeUndefined();
    expect(normalizeOrderListSearch('  x ')).toBeUndefined();
  });

  it('keeps two+ character terms and uuid fragments', () => {
    expect(normalizeOrderListSearch('ab')).toBe('ab');
    expect(normalizeOrderListSearch('550e8400')).toBe('550e8400');
  });
});

describe('orderListSearchVariants', () => {
  it('adds digit-only variant for formatted card numbers', () => {
    expect(orderListSearchVariants('5375 4112 3456 7890')).toEqual(
      expect.arrayContaining(['5375 4112 3456 7890', '5375411234567890']),
    );
  });
});

describe('buildPayinOrderSearchOr', () => {
  it('returns empty array for blank search', () => {
    expect(buildPayinOrderSearchOr('')).toEqual([]);
    expect(buildPayinOrderSearchOr('   ')).toEqual([]);
    expect(buildPayinOrderSearchOr('a')).toEqual([]);
  });

  it('uses requestId and requisite fields for non-UUID fragments', () => {
    const clauses = buildPayinOrderSearchOr('4111');
    expect(clauses.some((c) => 'requestId' in c)).toBe(true);
    expect(clauses.some((c) => 'requisite' in c)).toBe(true);
    expect(clauses.some((c) => 'detailsNumber' in c)).toBe(false);
  });

  it('searches normalized requisite digits for formatted card input', () => {
    const clauses = buildPayinOrderSearchOr('5375 4112');
    const requisiteClause = clauses.find((c) => 'requisite' in c) as {
      requisite: { OR: Array<{ numberNormalized?: { contains: string } }> };
    };
    expect(
      requisiteClause.requisite.OR.some((c) => c.numberNormalized?.contains === '53754112'),
    ).toBe(true);
  });

  it('prepends exact id match when term is a full UUID', () => {
    const id = '550e8400-e29b-41d4-a716-446655440000';
    expect(buildPayinOrderSearchOr(id)).toEqual(expect.arrayContaining([{ id }]));
  });

  it('includes merchant name when requested', () => {
    expect(buildPayinOrderSearchOr('acme', { merchantNameContains: true })).toEqual(
      expect.arrayContaining([
        { merchant: { name: { contains: 'acme', mode: 'insensitive' } } },
      ]),
    );
  });
});

describe('buildPayoutOrderSearchOr', () => {
  it('uses requestId and payout recipient fields for non-UUID fragments', () => {
    const clauses = buildPayoutOrderSearchOr('4111');
    expect(clauses.some((c) => 'requestId' in c)).toBe(true);
    expect(clauses.some((c) => 'detailsNumber' in c)).toBe(true);
    expect(clauses.some((c) => 'requisite' in c)).toBe(false);
  });
});

describe('buildAppealListSearchOr', () => {
  it('includes appeal id and requisite fields for a text term', () => {
    const clauses = buildAppealListSearchOr('4111');
    expect(clauses.some((c) => 'payinOrder' in c && 'requisite' in (c.payinOrder as object))).toBe(
      true,
    );
  });

  it('searches normalized requisite digits for formatted card input', () => {
    const clauses = buildAppealListSearchOr('5375 4112');
    const requisiteClause = clauses.find(
      (c) => 'payinOrder' in c && 'requisite' in (c.payinOrder as object),
    ) as {
      payinOrder: { requisite: { OR: Array<{ numberNormalized?: { contains: string } }> } };
    };
    expect(
      requisiteClause.payinOrder.requisite.OR.some(
        (c) => c.numberNormalized?.contains === '53754112',
      ),
    ).toBe(true);
  });

  it('prepends appeal id for full UUID', () => {
    const id = '550e8400-e29b-41d4-a716-446655440000';
    expect(buildAppealListSearchOr(id)[0]).toEqual({ id });
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
