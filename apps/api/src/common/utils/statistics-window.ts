import type { StatisticsQueryDto } from '../dto/statistics-query.dto';

export interface ResolvedStatisticsWindow {
  from: Date;
  to: Date;
  /** Preset id when used, or null for custom / default range. */
  period: '24h' | '7d' | '30d' | '90d' | null;
  dateFrom: string | null;
  dateTo: string | null;
}

/**
 * Resolves [from, to] for statistics queries.
 * Priority: `period` overrides custom dates. If nothing is set, defaults to last 7 days (same as owner UI).
 */
export function resolveStatisticsWindow(
  query: StatisticsQueryDto,
): ResolvedStatisticsWindow {
  const now = new Date();

  if (query.period) {
    const to = new Date(now);
    const from = new Date(now);
    const dayOffsets: Record<NonNullable<StatisticsQueryDto['period']>, number> = {
      '24h': 1,
      '7d': 7,
      '30d': 30,
      '90d': 90,
    };
    from.setDate(from.getDate() - dayOffsets[query.period]);
    from.setHours(0, 0, 0, 0);
    return {
      from,
      to,
      period: query.period,
      dateFrom: from.toISOString(),
      dateTo: to.toISOString(),
    };
  }

  if (query.dateFrom || query.dateTo) {
    const from = query.dateFrom ? new Date(query.dateFrom) : new Date(now);
    const to = query.dateTo ? new Date(query.dateTo) : new Date(now);
    if (query.dateFrom) {
      from.setHours(0, 0, 0, 0);
    } else {
      from.setTime(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      from.setHours(0, 0, 0, 0);
    }
    if (query.dateTo) {
      to.setHours(23, 59, 59, 999);
    } else {
      to.setHours(23, 59, 59, 999);
    }
    return {
      from,
      to,
      period: null,
      dateFrom: query.dateFrom ?? null,
      dateTo: query.dateTo ?? null,
    };
  }

  const to = new Date(now);
  const from = new Date(now);
  from.setDate(from.getDate() - 7);
  from.setHours(0, 0, 0, 0);
  return {
    from,
    to,
    period: '7d',
    dateFrom: from.toISOString(),
    dateTo: to.toISOString(),
  };
}
