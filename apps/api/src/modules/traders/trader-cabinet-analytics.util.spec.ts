import {
  alignBucketStartUtc,
  enumerateBucketStartsUtc,
  type TraderCabinetAnalyticsGranularity,
} from './trader-cabinet-analytics.util';

describe('enumerateBucketStartsUtc', () => {
  it.each<{
    granularity: TraderCabinetAnalyticsGranularity;
    from: Date;
    to: Date;
    expectCount: number;
    lastIso: string;
  }>([
    {
      granularity: 'hour',
      from: new Date('2026-04-03T02:30:00.000Z'),
      to: new Date('2026-04-03T04:45:00.000Z'),
      expectCount: 3,
      lastIso: '2026-04-03T04:00:00.000Z',
    },
    {
      granularity: 'day',
      from: new Date('2026-04-01T15:00:00.000Z'),
      to: new Date('2026-04-03T08:00:00.000Z'),
      expectCount: 3,
      lastIso: '2026-04-03T00:00:00.000Z',
    },
    {
      granularity: 'week',
      from: new Date('2026-04-01T12:00:00.000Z'),
      to: new Date('2026-04-10T12:00:00.000Z'),
      expectCount: 2,
      lastIso: '2026-04-06T00:00:00.000Z',
    },
    {
      granularity: 'month',
      from: new Date('2026-04-15T00:00:00.000Z'),
      to: new Date('2026-06-10T00:00:00.000Z'),
      expectCount: 3,
      lastIso: '2026-06-01T00:00:00.000Z',
    },
  ])(
    'enumerates $granularity buckets with stable alignment',
    ({ granularity, from, to, expectCount, lastIso }) => {
      const buckets = enumerateBucketStartsUtc(from, to, granularity);
      expect(buckets.length).toBe(expectCount);
      expect(buckets[buckets.length - 1].toISOString()).toBe(lastIso);
      expect(
        buckets.every((d) => d.getTime() === alignBucketStartUtc(d, granularity).getTime()),
      ).toBe(true);
    },
  );
});
