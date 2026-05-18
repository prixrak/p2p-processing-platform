'use client';

import { useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Coins, PieChart } from 'lucide-react';
import { Card, StatCard } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { api } from '@/lib/api';
import { internalPaths } from '@/lib/internal-api';
import { traderKeys } from '@/lib/query-keys';
import { formatCurrency } from '@/lib/utils';
import { formatErrorMessage } from '@/lib/format-error';

type AnalyticsGranularity = 'hour' | 'day' | 'week' | 'month';

type TraderCabinetAnalytics = {
  traderId: string;
  currency: string;
  granularity: AnalyticsGranularity;
  dateBasis: 'created' | 'completed';
  period: '24h' | '7d' | '30d' | '90d' | null;
  dateFrom: string | null;
  dateTo: string | null;
  cabinetProfitTotal: number;
  series: Array<{
    periodStart: string;
    payInCount: number;
    payInAmount: number;
    payoutCount: number;
    payoutAmount: number;
    disputeCount: number;
    disputeAmount: number;
    profitAmount: number;
  }>;
};

function defaultCustomRange(): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - 6);
  const ymd = (x: Date) => x.toISOString().slice(0, 10);
  return { from: ymd(from), to: ymd(to) };
}

export default function TraderAnalyticsPage() {
  const t = useTranslations('Trader.Analytics');
  const [rangeMode, setRangeMode] = useState<'preset' | 'custom'>('preset');
  const [presetPeriod, setPresetPeriod] = useState('7d');
  const [customDates, setCustomDates] = useState(defaultCustomRange);
  const [granularity, setGranularity] = useState<AnalyticsGranularity>('day');
  const [dateBasis, setDateBasis] = useState<'created' | 'completed'>('created');
  const [currency, setCurrency] = useState('UAH');

  const presetPeriods = useMemo(
    () => [
      { value: '24h', label: t('period24h') },
      { value: '7d', label: t('period7d') },
      { value: '30d', label: t('period30d') },
      { value: '90d', label: t('period90d') },
    ],
    [t],
  );

  const rangeModes = useMemo(
    () => [
      { value: 'preset', label: t('presetRange') },
      { value: 'custom', label: t('customRange') },
    ],
    [t],
  );

  const dateBasisOptions = useMemo(
    () => [
      { value: 'created', label: t('dateBasisCreated') },
      { value: 'completed', label: t('dateBasisCompleted') },
    ],
    [t],
  );

  const granularityButtons = useMemo(
    () =>
      [
        { id: 'hour' as const, label: t('granularityHour') },
        { id: 'day' as const, label: t('granularityDay') },
        { id: 'week' as const, label: t('granularityWeek') },
        { id: 'month' as const, label: t('granularityMonth') },
      ] as const,
    [t],
  );

  const formatUtcBucketLabel = useCallback(
    (iso: string, g: AnalyticsGranularity): string => {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return iso;
      const year = String(d.getUTCFullYear());
      const month = String(d.getUTCMonth() + 1).padStart(2, '0');
      const day = String(d.getUTCDate()).padStart(2, '0');
      const hour = String(d.getUTCHours()).padStart(2, '0');
      if (g === 'hour') return t('bucketHour', { year, month, day, hour });
      if (g === 'day') return t('bucketDay', { year, month, day });
      if (g === 'week') return t('bucketWeek', { year, month, day });
      return t('bucketMonth', { year, month });
    },
    [t],
  );

  const { data: balances } = useQuery({
    queryKey: traderKeys.balancesMe(),
    queryFn: () =>
      api.get<Array<{ currency: string; amount: unknown }>>(internalPaths.traderMeBalances),
  });

  const queryParams = useMemo(() => {
    const p: Record<string, string> = {
      granularity,
      dateBasis,
      currency,
    };
    if (rangeMode === 'preset') {
      p.period = presetPeriod;
    } else {
      p.dateFrom = `${customDates.from}T00:00:00.000Z`;
      p.dateTo = `${customDates.to}T23:59:59.999Z`;
    }
    return p;
  }, [currency, customDates.from, customDates.to, dateBasis, granularity, presetPeriod, rangeMode]);

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: traderKeys.analytics(queryParams),
    queryFn: () => api.get<TraderCabinetAnalytics>(internalPaths.traderMeAnalytics, queryParams),
  });

  const busy = isLoading || isFetching;
  const displayCurrency = data?.currency ?? currency;

  const seriesNewestFirst = useMemo(() => {
    const s = data?.series;
    if (!s?.length) return s ?? [];
    return [...s].sort((a, b) => b.periodStart.localeCompare(a.periodStart));
  }, [data]);

  const currencyOptions = useMemo(() => {
    const codes = [...new Set(balances?.map((b) => b.currency) ?? [])];
    if (currency && !codes.includes(currency)) codes.push(currency);
    codes.sort();
    if (codes.length === 0) {
      return [{ value: 'UAH', label: 'UAH' }];
    }
    return codes.map((c) => ({ value: c, label: c }));
  }, [balances, currency]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3">
          <PieChart className="h-6 w-6 text-accent-blue" />
          <div>
            <h1 className="text-2xl font-bold text-text-primary">{t('title')}</h1>
            <p className="text-sm text-text-muted">{t('subtitle')}</p>
          </div>
        </div>
      </div>

      <Card className="p-4 space-y-4">
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
          <Select
            label={t('currency')}
            options={currencyOptions}
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className="w-full"
            rootClassName="gap-1"
          />
          <Select
            label={t('dateBasis')}
            options={dateBasisOptions}
            value={dateBasis}
            onChange={(e) => setDateBasis(e.target.value as 'created' | 'completed')}
            className="w-full"
            rootClassName="gap-1"
          />
          <Select
            label={t('rangeMode')}
            options={rangeModes}
            value={rangeMode}
            onChange={(e) => setRangeMode(e.target.value as 'preset' | 'custom')}
            className="w-full"
            rootClassName="gap-1"
          />
          {rangeMode === 'preset' ? (
            <Select
              label={t('presetWindow')}
              options={presetPeriods}
              value={presetPeriod}
              onChange={(e) => setPresetPeriod(e.target.value)}
              className="w-full"
              rootClassName="gap-1"
            />
          ) : (
            <div className="grid grid-cols-2 gap-2 items-end">
              <div>
                <label className="mb-1 block text-xs font-medium text-text-secondary">
                  {t('fromUtc')}
                </label>
                <input
                  type="date"
                  value={customDates.from}
                  onChange={(e) => setCustomDates((d) => ({ ...d, from: e.target.value }))}
                  className="w-full rounded-lg border border-border-primary bg-bg-secondary px-3 py-2 text-sm text-text-primary"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-text-secondary">
                  {t('toUtc')}
                </label>
                <input
                  type="date"
                  value={customDates.to}
                  onChange={(e) => setCustomDates((d) => ({ ...d, to: e.target.value }))}
                  className="w-full rounded-lg border border-border-primary bg-bg-secondary px-3 py-2 text-sm text-text-primary"
                />
              </div>
            </div>
          )}
        </div>

        <div>
          <p className="mb-2 text-xs font-medium text-text-secondary">{t('groupingHint')}</p>
          <div className="flex flex-wrap gap-2">
            {granularityButtons.map((g) => (
              <Button
                key={g.id}
                type="button"
                size="sm"
                variant={granularity === g.id ? 'primary' : 'secondary'}
                onClick={() => setGranularity(g.id)}
              >
                {g.label}
              </Button>
            ))}
          </div>
        </div>
      </Card>

      {error && (
        <Card className="p-4">
          <p className="text-sm text-accent-red">{formatErrorMessage(error)}</p>
        </Card>
      )}

      <StatCard
        title={t('statProfit')}
        value={busy || !data ? t('loading') : formatCurrency(data.cabinetProfitTotal, displayCurrency)}
        icon={Coins}
      />

      <Card>
        <h2 className="text-lg font-semibold text-text-primary mb-1">{t('volumesTitle')}</h2>
        <p className="text-xs text-text-muted mb-4">{t('volumesHelp')}</p>
        <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
          <table className="min-w-[960px] w-full text-sm">
            <thead>
              <tr className="border-b border-border-primary text-left text-text-secondary">
                <th className="py-2 pr-3 font-medium">{t('colPeriod')}</th>
                <th className="py-2 pr-3 font-medium">{t('colProfit')}</th>
                <th className="py-2 pr-3 font-medium">{t('colPayin')}</th>
                <th className="py-2 pr-3 font-medium">{t('colPayout')}</th>
                <th className="py-2 pr-3 font-medium">{t('colDisputes')}</th>
              </tr>
            </thead>
            <tbody>
              {busy || !data ? (
                <tr>
                  <td colSpan={5} className="py-8 text-text-muted">
                    {t('loading')}
                  </td>
                </tr>
              ) : (
                seriesNewestFirst.map((row) => (
                  <tr key={row.periodStart} className="border-b border-border-primary/60">
                    <td className="py-2 pr-3 text-text-primary whitespace-nowrap">
                      {formatUtcBucketLabel(row.periodStart, data.granularity)}
                    </td>
                    <td className="py-2 pr-3 text-text-primary">
                      {formatCurrency(row.profitAmount, displayCurrency)}
                    </td>
                    <td className="py-2 pr-3">
                      <span className="text-text-primary">{row.payInCount}</span>
                      <span className="text-text-muted"> · </span>
                      <span className="text-text-primary">{formatCurrency(row.payInAmount, displayCurrency)}</span>
                    </td>
                    <td className="py-2 pr-3">
                      <span className="text-text-primary">{row.payoutCount}</span>
                      <span className="text-text-muted"> · </span>
                      <span className="text-text-primary">{formatCurrency(row.payoutAmount, displayCurrency)}</span>
                    </td>
                    <td className="py-2 pr-3">
                      <span className="text-text-primary">{row.disputeCount}</span>
                      <span className="text-text-muted"> · </span>
                      <span className="text-text-primary">{formatCurrency(row.disputeAmount, displayCurrency)}</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
