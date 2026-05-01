/** Time bucket granularity for trader cabinet analytics (display grouping only). */
export type TraderCabinetAnalyticsGranularity = 'hour' | 'day' | 'week' | 'month';

/** Use order creation timestamps vs completion-style timestamps for filters and grouping. */
export type TraderCabinetAnalyticsDateBasis = 'created' | 'completed';

const MS_HOUR = 60 * 60 * 1000;
const MS_DAY = 24 * MS_HOUR;

/** Align UTC instant to Postgres `date_trunc` bucket start (`week` = ISO week starting Monday UTC). */
export function alignBucketStartUtc(
  instant: Date,
  granularity: TraderCabinetAnalyticsGranularity,
): Date {
  const d = new Date(instant.getTime());
  d.setUTCSeconds(0, 0);
  d.setUTCMinutes(0);

  switch (granularity) {
    case 'hour':
      return d;
    case 'day':
      d.setUTCHours(0, 0, 0, 0);
      return d;
    case 'week': {
      const day = d.getUTCDay();
      const daysSinceMonday = (day + 6) % 7;
      d.setUTCDate(d.getUTCDate() - daysSinceMonday);
      d.setUTCHours(0, 0, 0, 0);
      return d;
    }
    case 'month':
      d.setUTCDate(1);
      d.setUTCHours(0, 0, 0, 0);
      return d;
    default:
      return d;
  }
}

/** Inclusive-ish bucket enumeration: aligned starts from `periodFrom` through last bucket overlapping `periodTo`. */
export function enumerateBucketStartsUtc(
  periodFrom: Date,
  periodTo: Date,
  granularity: TraderCabinetAnalyticsGranularity,
): Date[] {
  const out: Date[] = [];
  const start = alignBucketStartUtc(new Date(periodFrom), granularity);
  const endCap = alignBucketStartUtc(new Date(periodTo), granularity);
  const cur = new Date(start.getTime());

  const stepBucket = (): void => {
    switch (granularity) {
      case 'hour':
        cur.setTime(cur.getTime() + MS_HOUR);
        break;
      case 'day':
        cur.setUTCDate(cur.getUTCDate() + 1);
        break;
      case 'week':
        cur.setUTCDate(cur.getUTCDate() + 7);
        break;
      case 'month':
        cur.setUTCMonth(cur.getUTCMonth() + 1);
        break;
    }
  };

  while (cur.getTime() <= endCap.getTime()) {
    out.push(new Date(cur.getTime()));
    stepBucket();
  }
  return out;
}
