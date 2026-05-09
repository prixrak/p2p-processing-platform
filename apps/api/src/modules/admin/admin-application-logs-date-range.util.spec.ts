import { BadRequestException } from '@nestjs/common';
import {
  resolveApplicationLogsDateRange,
  resolvePeriodRange,
} from './admin-application-logs-date-range.util';

describe('resolveApplicationLogsDateRange', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-05-09T15:30:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('defaults to today (UTC start through now) when no params', () => {
    const { from, to } = resolveApplicationLogsDateRange({});
    expect(from.toISOString()).toBe('2026-05-09T00:00:00.000Z');
    expect(to.toISOString()).toBe('2026-05-09T15:30:00.000Z');
  });

  it('uses period yesterday as full UTC calendar day', () => {
    const { from, to } = resolveApplicationLogsDateRange({ period: 'yesterday' });
    expect(from.toISOString()).toBe('2026-05-08T00:00:00.000Z');
    expect(to.toISOString()).toBe('2026-05-08T23:59:59.999Z');
  });

  it('prefers explicit ISO range when both dates are set', () => {
    const { from, to } = resolveApplicationLogsDateRange({
      period: 'yesterday',
      dateFrom: '2026-01-01T00:00:00.000Z',
      dateTo: '2026-01-02T00:00:00.000Z',
    });
    expect(from.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(to.toISOString()).toBe('2026-01-02T00:00:00.000Z');
  });

  it('rejects dateFrom without dateTo', () => {
    expect(() =>
      resolveApplicationLogsDateRange({ dateFrom: '2026-01-01T00:00:00.000Z' }),
    ).toThrow(BadRequestException);
  });

  it('rejects dateTo without dateFrom', () => {
    expect(() =>
      resolveApplicationLogsDateRange({ dateTo: '2026-01-02T00:00:00.000Z' }),
    ).toThrow(BadRequestException);
  });

  it('rejects invalid period', () => {
    expect(() => resolveApplicationLogsDateRange({ period: 'invalid' })).toThrow(
      BadRequestException,
    );
  });
});

describe('resolvePeriodRange', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-05-09T12:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('covers last month fully in UTC', () => {
    const { from, to } = resolvePeriodRange('last_month', new Date());
    expect(from.toISOString()).toBe('2026-04-01T00:00:00.000Z');
    expect(to.toISOString()).toBe('2026-04-30T23:59:59.999Z');
  });
});
