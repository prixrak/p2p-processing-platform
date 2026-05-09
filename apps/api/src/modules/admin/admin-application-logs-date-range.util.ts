import { BadRequestException } from '@nestjs/common';
import {
  APPLICATION_LOG_PERIOD_VALUES,
  type ApplicationLogPeriod,
} from './dto/application-logs-query.dto';

function isApplicationLogPeriod(v: string): v is ApplicationLogPeriod {
  return (APPLICATION_LOG_PERIOD_VALUES as readonly string[]).includes(v);
}

function utcStartOfDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}

function utcEndOfDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999));
}

function utcStartOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0, 0));
}

function utcEndOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 23, 59, 59, 999));
}

function utcSubDays(d: Date, n: number): Date {
  const x = new Date(d.getTime());
  x.setUTCDate(x.getUTCDate() - n);
  return x;
}

function utcSubMonths(d: Date, n: number): Date {
  const x = new Date(d.getTime());
  x.setUTCMonth(x.getUTCMonth() - n);
  return x;
}

export function resolvePeriodRange(
  period: ApplicationLogPeriod,
  now: Date,
): { from: Date; to: Date } {
  switch (period) {
    case 'today':
      return { from: utcStartOfDay(now), to: now };
    case 'yesterday': {
      const y = utcSubDays(now, 1);
      return { from: utcStartOfDay(y), to: utcEndOfDay(y) };
    }
    case '7d':
      return { from: utcStartOfDay(utcSubDays(now, 6)), to: now };
    case '30d':
      return { from: utcStartOfDay(utcSubDays(now, 29)), to: now };
    case 'this_month':
      return { from: utcStartOfMonth(now), to: now };
    case 'last_month': {
      const prev = utcSubMonths(now, 1);
      return { from: utcStartOfMonth(prev), to: utcEndOfMonth(prev) };
    }
    default: {
      const _exhaustive: never = period;
      throw new BadRequestException(`Unsupported period: ${_exhaustive}`);
    }
  }
}

/**
 * Resolves list/summary date bounds: explicit ISO range wins; otherwise `period` (default today).
 */
export function resolveApplicationLogsDateRange(
  params: { period?: string; dateFrom?: string; dateTo?: string },
  now: Date = new Date(),
): { from: Date; to: Date } {
  const rawFrom = params.dateFrom?.trim();
  const rawTo = params.dateTo?.trim();
  const hasFrom = Boolean(rawFrom);
  const hasTo = Boolean(rawTo);

  if (hasFrom !== hasTo) {
    throw new BadRequestException(
      'dateFrom and dateTo must both be provided for a custom range',
    );
  }

  if (hasFrom && hasTo) {
    const from = new Date(rawFrom!);
    const to = new Date(rawTo!);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw new BadRequestException('Invalid dateFrom or dateTo');
    }
    return { from, to };
  }

  const rawPeriod = params.period?.trim();
  const periodKey = rawPeriod && rawPeriod.length > 0 ? rawPeriod : 'today';

  if (!isApplicationLogPeriod(periodKey)) {
    throw new BadRequestException(`Invalid period: ${periodKey}`);
  }

  return resolvePeriodRange(periodKey, now);
}
