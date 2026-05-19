'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Filter, LineChart, X } from 'lucide-react';
import {
  ApplicationLogUiStatus,
  DirectionType,
} from '@p2p/shared';
import type { StaffRolePrefix } from '@/lib/query-keys';
import { adminKeys, ownerKeys } from '@/lib/query-keys';
import { api } from '@/lib/api';
import { internalPaths } from '@/lib/internal-api';
import { Button } from '@/components/ui/button';
import { OrderIdCopyCell } from '@/components/ui/order-id-copy-cell';
import { Badge } from '@/components/ui/badge';
import { DataTable } from '@/components/ui/data-table';
import { FilterBar, FilterInput } from '@/components/ui/filters';
import { Modal } from '@/components/ui/modal';
import { Select } from '@/components/ui/select';
import { cn, formatDateTime } from '@/lib/utils';

const CHART_GREEN = '#22c55e';
const CHART_RED = '#ef4444';
const CHART_BLUE = '#3b82f6';
const CHART_AMBER = '#f59e0b';

export type OrdersLogsDatePreset =
  | 'today'
  | 'yesterday'
  | '7d'
  | '30d'
  | 'this_month'
  | 'last_month';

export interface OrdersLogsFilters {
  datePreset: OrdersLogsDatePreset;
  /** datetime-local value (`YYYY-MM-DDTHH:mm`) when using custom range; empty means preset-only */
  customDateFrom: string;
  customDateTo: string;
  kind: '' | DirectionType;
  merchantId: string;
  traderId: string;
  currency: string;
  uiStatus: '' | ApplicationLogUiStatus;
  errorCode: string;
  partnerIp: string;
  amountMin: string;
  amountMax: string;
  page: number;
  limit: number;
}

export function defaultOrdersLogsFilters(): OrdersLogsFilters {
  return {
    datePreset: 'today',
    customDateFrom: '',
    customDateTo: '',
    kind: '',
    merchantId: '',
    traderId: '',
    currency: '',
    uiStatus: '',
    errorCode: '',
    partnerIp: '',
    amountMin: '',
    amountMax: '',
    page: 1,
    limit: 20,
  };
}

function appendDateRangeParams(f: OrdersLogsFilters, p: URLSearchParams) {
  const rawFrom = f.customDateFrom.trim();
  const rawTo = f.customDateTo.trim();
  if (rawFrom && rawTo) {
    const df = new Date(rawFrom);
    const dt = new Date(rawTo);
    if (!Number.isNaN(df.getTime()) && !Number.isNaN(dt.getTime())) {
      p.set('dateFrom', df.toISOString());
      p.set('dateTo', dt.toISOString());
      return;
    }
  }
  p.set('period', f.datePreset);
}

function serializeListFilters(f: OrdersLogsFilters): string {
  const p = new URLSearchParams();
  appendDateRangeParams(f, p);
  if (f.kind) p.set('kind', f.kind);
  if (f.merchantId) p.set('merchantId', f.merchantId);
  if (f.traderId) p.set('traderId', f.traderId);
  if (f.currency) p.set('currency', f.currency);
  if (f.uiStatus) p.set('uiStatus', f.uiStatus);
  if (f.errorCode) p.set('errorCode', f.errorCode);
  if (f.partnerIp.trim()) p.set('partnerIp', f.partnerIp.trim());
  if (f.amountMin.trim()) p.set('amountMin', f.amountMin.trim());
  if (f.amountMax.trim()) p.set('amountMax', f.amountMax.trim());
  p.set('page', String(f.page));
  p.set('limit', String(f.limit));
  return p.toString();
}

function serializeSummaryFilters(f: OrdersLogsFilters): string {
  const p = new URLSearchParams();
  appendDateRangeParams(f, p);
  if (f.kind) p.set('kind', f.kind);
  if (f.merchantId) p.set('merchantId', f.merchantId);
  if (f.traderId) p.set('traderId', f.traderId);
  if (f.currency) p.set('currency', f.currency);
  if (f.uiStatus) p.set('uiStatus', f.uiStatus);
  if (f.errorCode) p.set('errorCode', f.errorCode);
  if (f.partnerIp.trim()) p.set('partnerIp', f.partnerIp.trim());
  if (f.amountMin.trim()) p.set('amountMin', f.amountMin.trim());
  if (f.amountMax.trim()) p.set('amountMax', f.amountMax.trim());
  return p.toString();
}

type ApplicationLogRow = {
  id: string;
  kind: 'PAYIN' | 'PAYOUT';
  requestId: string;
  createdAt: string;
  merchantName: string;
  traderLabel: string | null;
  direction: string;
  amount: number;
  currency: string;
  uiStatus: ApplicationLogUiStatus;
  errorCode: string | null;
  errorMessage: string | null;
  externalApiPath: string | null;
  partnerIp: string | null;
};

type ApplicationLogsListResponse = {
  items: ApplicationLogRow[];
  total: number;
  page: number;
  limit: number;
};

type ApplicationLogsSummaryResponse = {
  avgAmountPayin: number | null;
  avgAmountPayout: number | null;
  countPayin: number;
  countPayout: number;
  payinSuccessCount: number;
  payinErrorCount: number;
  payoutSuccessCount: number;
  payoutErrorCount: number;
  totals: {
    payinSuccessSum: number;
    payinErrorSum: number;
    payoutSuccessSum: number;
    payoutErrorSum: number;
  };
};

type MetaResponse = {
  merchants: { id: string; name: string }[];
  traders: { id: string; email: string }[];
  currencies: string[];
  errorCodes: string[];
};

function uiStatusBadge(status: ApplicationLogUiStatus) {
  if (status === ApplicationLogUiStatus.SUCCESS) {
    return <Badge variant="success">Success</Badge>;
  }
  if (status === ApplicationLogUiStatus.ERROR) {
    return <Badge variant="danger">Error</Badge>;
  }
  return <Badge variant="warning">Pending</Badge>;
}

function kindBadge(kind: ApplicationLogRow['kind']) {
  if (kind === 'PAYIN') {
    return <Badge variant="info">Pay-In</Badge>;
  }
  return <Badge variant="muted">Pay-Out</Badge>;
}

/**
 * Wrap charts in a fixed pixel box and use ResponsiveContainer 100%/100%.
 * Numeric height + percentage width avoids Recharts' overflow-x-visible inner wrapper quirks in flex/grid layouts.
 */
function ChartCard({
  title,
  loading,
  chartHeightPx,
  children,
}: {
  title: string;
  loading?: boolean;
  chartHeightPx: 260 | 280;
  children: React.ReactNode;
}) {
  const hClass = chartHeightPx === 280 ? 'h-[280px]' : 'h-[260px]';
  return (
    <div className="flex flex-col rounded-xl border border-border-primary bg-bg-card p-4">
      <h3 className="mb-3 text-sm font-semibold text-text-primary">{title}</h3>
      <div
        className={cn(
          'w-full min-w-0 shrink-0',
          hClass,
          loading && 'flex items-center justify-center text-sm text-text-muted',
        )}
      >
        {loading ? (
          'Loading…'
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            {children}
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

export function OrdersLogsPageView({
  staffPrefix,
}: {
  staffPrefix: StaffRolePrefix;
}) {
  const keys = staffPrefix === 'admin' ? adminKeys : ownerKeys;
  const [filters, setFilters] = useState<OrdersLogsFilters>(() =>
    defaultOrdersLogsFilters(),
  );
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [draft, setDraft] = useState<OrdersLogsFilters>(() =>
    defaultOrdersLogsFilters(),
  );
  const [selected, setSelected] = useState<ApplicationLogRow | null>(null);

  const queryClient = useQueryClient();

  const listQs = useMemo(() => serializeListFilters(filters), [filters]);
  const summaryQs = useMemo(() => serializeSummaryFilters(filters), [filters]);

  useEffect(() => {
    if (drawerOpen) {
      setDraft(filters);
    }
  }, [drawerOpen, filters]);

  const listKey = useMemo(
    () => keys.ordersLogs(listQs),
    [keys, listQs],
  );

  const { data: meta } = useQuery({
    queryKey: [...keys.ordersLogsScope, 'meta'],
    queryFn: () => api.get<MetaResponse>(internalPaths.adminOrdersLogsMeta),
  });

  const { data: listData, isLoading: listLoading } = useQuery({
    queryKey: listKey,
    queryFn: () =>
      api.get<ApplicationLogsListResponse>(
        `${internalPaths.adminOrdersLogs}?${listQs}`,
      ),
  });

  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: [...keys.ordersLogsScope, 'summary', summaryQs],
    queryFn: () =>
      api.get<ApplicationLogsSummaryResponse>(
        `${internalPaths.adminOrdersLogsSummary}?${summaryQs}`,
      ),
  });

  const applyPreset = useCallback((id: OrdersLogsDatePreset) => {
    setFilters((f) => ({
      ...f,
      datePreset: id,
      customDateFrom: '',
      customDateTo: '',
      page: 1,
    }));
  }, []);

  const hasCustomRange =
    filters.customDateFrom.trim() !== '' && filters.customDateTo.trim() !== '';

  const totalPages = Math.max(
    1,
    Math.ceil((listData?.total ?? 0) / (filters.limit || 20)),
  );

  const sortedRows = useMemo(() => {
    const items = listData?.items ?? [];
    return [...items].sort((a, b) => {
      const db = new Date(b.createdAt).getTime();
      const da = new Date(a.createdAt).getTime();
      if (Number.isNaN(db) || Number.isNaN(da)) return 0;
      if (db !== da) return db - da;
      return b.id.localeCompare(a.id);
    });
  }, [listData?.items]);

  const avgChartData = [
    {
      label: 'Pay-In',
      avg: summary?.avgAmountPayin ?? 0,
    },
    {
      label: 'Pay-Out',
      avg: summary?.avgAmountPayout ?? 0,
    },
  ];

  const opsPieData = [
    { name: 'Pay-In', value: summary?.countPayin ?? 0, fill: CHART_BLUE },
    { name: 'Pay-Out', value: summary?.countPayout ?? 0, fill: CHART_AMBER },
  ];

  const payinRateData = [
    { name: 'Success', value: summary?.payinSuccessCount ?? 0, fill: CHART_GREEN },
    { name: 'Error', value: summary?.payinErrorCount ?? 0, fill: CHART_RED },
  ];

  const payoutRateData = [
    { name: 'Success', value: summary?.payoutSuccessCount ?? 0, fill: CHART_GREEN },
    { name: 'Error', value: summary?.payoutErrorCount ?? 0, fill: CHART_RED },
  ];

  const stackedTotals = [
    {
      name: 'Pay-In',
      success: summary?.totals.payinSuccessSum ?? 0,
      error: summary?.totals.payinErrorSum ?? 0,
    },
    {
      name: 'Pay-Out',
      success: summary?.totals.payoutSuccessSum ?? 0,
      error: summary?.totals.payoutErrorSum ?? 0,
    },
  ];

  const chips = useMemo(() => {
    const out: { key: string; label: string; onRemove: () => void }[] = [];
    const push = (key: string, label: string, onRemove: () => void) =>
      out.push({ key, label, onRemove });

    if (filters.kind) {
      push('kind', `Kind: ${filters.kind}`, () =>
        setFilters((f) => ({ ...f, kind: '', page: 1 })),
      );
    }
    if (filters.merchantId && meta) {
      const m = meta.merchants.find((x) => x.id === filters.merchantId);
      push('merchant', `Partner: ${m?.name ?? filters.merchantId}`, () =>
        setFilters((f) => ({ ...f, merchantId: '', page: 1 })),
      );
    }
    if (filters.traderId && meta) {
      const t = meta.traders.find((x) => x.id === filters.traderId);
      push('trader', `Trader: ${t?.email ?? filters.traderId}`, () =>
        setFilters((f) => ({ ...f, traderId: '', page: 1 })),
      );
    }
    if (filters.currency) {
      push('currency', `Currency: ${filters.currency}`, () =>
        setFilters((f) => ({ ...f, currency: '', page: 1 })),
      );
    }
    if (filters.uiStatus) {
      push('uiStatus', `Status: ${filters.uiStatus}`, () =>
        setFilters((f) => ({ ...f, uiStatus: '', page: 1 })),
      );
    }
    if (filters.errorCode) {
      push('errorCode', `Error code: ${filters.errorCode}`, () =>
        setFilters((f) => ({ ...f, errorCode: '', page: 1 })),
      );
    }
    if (filters.partnerIp.trim()) {
      push('partnerIp', `IP: ${filters.partnerIp.trim()}`, () =>
        setFilters((f) => ({ ...f, partnerIp: '', page: 1 })),
      );
    }
    if (filters.amountMin.trim()) {
      push('amountMin', `Amount ≥ ${filters.amountMin}`, () =>
        setFilters((f) => ({ ...f, amountMin: '', page: 1 })),
      );
    }
    if (filters.amountMax.trim()) {
      push('amountMax', `Amount ≤ ${filters.amountMax}`, () =>
        setFilters((f) => ({ ...f, amountMax: '', page: 1 })),
      );
    }
    return out;
  }, [filters, meta]);

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-text-primary flex items-center gap-2 sm:text-2xl">
            <LineChart size={24} />
            Orders logs
          </h1>
          <p className="text-sm text-text-muted mt-1 max-w-2xl">
            Pay-In and Pay-Out order logs with routing outcomes. Use a preset period or set both From
            and To for a custom range; other filters apply on top.
          </p>
        </div>
      </div>

      <FilterBar className="flex-wrap items-end gap-3">
        <div className="flex w-full gap-2 overflow-x-auto pb-1 -mx-1 px-1 snap-x snap-mandatory sm:flex-wrap sm:overflow-visible sm:pb-0 sm:mx-0 sm:px-0">
          {(
            [
              ['today', 'Today'],
              ['yesterday', 'Yesterday'],
              ['7d', '7 days'],
              ['30d', '30 days'],
              ['this_month', 'This month'],
              ['last_month', 'Last month'],
            ] as const
          ).map(([id, label]) => (
            <Button
              key={id}
              variant={
                !hasCustomRange && filters.datePreset === id ? 'primary' : 'secondary'
              }
              type="button"
              className="shrink-0 snap-start"
              onClick={() => applyPreset(id)}
            >
              {label}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap gap-3 items-end">
          <FilterInput
            label="From"
            type="datetime-local"
            value={filters.customDateFrom}
            onChange={(v) =>
              setFilters((f) => ({
                ...f,
                customDateFrom: v,
                page: 1,
              }))
            }
          />
          <FilterInput
            label="To"
            type="datetime-local"
            value={filters.customDateTo}
            onChange={(v) =>
              setFilters((f) => ({
                ...f,
                customDateTo: v,
                page: 1,
              }))
            }
          />
          <Button
            type="button"
            variant="secondary"
            className="gap-2"
            onClick={() => setDrawerOpen(true)}
          >
            <Filter size={16} />
            Filters
          </Button>
        </div>
        <p className="w-full text-xs text-text-muted">
          Leave From and To empty to use the selected preset (UTC). Both fields are required for a
          custom range.
        </p>
      </FilterBar>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Average amounts" loading={summaryLoading} chartHeightPx={260}>
          <BarChart data={avgChartData}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border-primary" />
            <XAxis dataKey="label" tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }} />
            <YAxis tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }} />
            <Tooltip
              contentStyle={{
                background: 'var(--color-bg-card)',
                border: '1px solid var(--color-border-primary)',
              }}
            />
            <Bar dataKey="avg" fill={CHART_BLUE} name="Avg amount" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ChartCard>

        <ChartCard title="Operations by direction" loading={summaryLoading} chartHeightPx={260}>
          <PieChart>
            <Pie
              data={opsPieData}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              outerRadius={88}
              label={({ name, percent }) => `${name}: ${((percent ?? 0) * 100).toFixed(1)}%`}
            >
              {opsPieData.map((e, i) => (
                <Cell key={i} fill={e.fill} />
              ))}
            </Pie>
            <Legend />
            <Tooltip />
          </PieChart>
        </ChartCard>

        <ChartCard title="Pay-In success vs error" loading={summaryLoading} chartHeightPx={260}>
          <PieChart>
            <Pie
              data={payinRateData}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={52}
              outerRadius={88}
              paddingAngle={2}
            >
              {payinRateData.map((e, i) => (
                <Cell key={i} fill={e.fill} />
              ))}
            </Pie>
            <Legend />
            <Tooltip />
          </PieChart>
        </ChartCard>

        <ChartCard title="Pay-Out success vs error" loading={summaryLoading} chartHeightPx={260}>
          <PieChart>
            <Pie
              data={payoutRateData}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={52}
              outerRadius={88}
              paddingAngle={2}
            >
              {payoutRateData.map((e, i) => (
                <Cell key={i} fill={e.fill} />
              ))}
            </Pie>
            <Legend />
            <Tooltip />
          </PieChart>
        </ChartCard>
      </div>

      <ChartCard
        title="Total amounts (success vs error)"
        loading={summaryLoading}
        chartHeightPx={280}
      >
        <BarChart data={stackedTotals}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border-primary" />
          <XAxis dataKey="name" tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }} />
          <YAxis tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }} />
          <Tooltip
            contentStyle={{
              background: 'var(--color-bg-card)',
              border: '1px solid var(--color-border-primary)',
            }}
          />
          <Legend />
          <Bar dataKey="success" stackId="a" fill={CHART_GREEN} name="Success sum" />
          <Bar dataKey="error" stackId="a" fill={CHART_RED} name="Error sum" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ChartCard>

      {chips.length > 0 && (
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs text-text-muted uppercase tracking-wide">Active filters</span>
          {chips.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={c.onRemove}
              className="inline-flex items-center gap-1 rounded-full border border-border-primary bg-bg-secondary px-2 py-0.5 text-xs text-text-primary hover:bg-bg-hover"
            >
              {c.label}
              <X size={12} className="text-text-muted" aria-hidden />
            </button>
          ))}
        </div>
      )}

      <p className="text-xs text-text-muted">
        Table sorted by creation time: newest rows first.
      </p>

      <DataTable<ApplicationLogRow>
        columns={[
          {
            key: 'requestId',
            header: 'Request ID',
            mobilePrimary: true,
            render: (row) => (
              <OrderIdCopyCell id={row.requestId} label="Request ID" />
            ),
          },
          {
            key: 'createdAt',
            header: 'Created',
            render: (row) => (
              <span className="tabular-nums text-xs">
                {formatDateTime(new Date(row.createdAt))}
              </span>
            ),
          },
          { key: 'merchantName', header: 'Partner' },
          {
            key: 'traderLabel',
            header: 'Trader',
            render: (row) => row.traderLabel ?? '—',
          },
          {
            key: 'kind',
            header: 'Kind',
            render: (row) => kindBadge(row.kind),
          },
          {
            key: 'amount',
            header: 'Amount',
            mobilePrimary: true,
            render: (row) => (
              <span className="tabular-nums">
                {row.amount.toLocaleString(undefined, { maximumFractionDigits: 4 })}{' '}
                {row.currency}
              </span>
            ),
          },
          {
            key: 'uiStatus',
            header: 'Status',
            mobilePrimary: true,
            render: (row) => uiStatusBadge(row.uiStatus),
          },
          {
            key: 'errorMessage',
            header: 'Error reason',
            hideOnMobile: true,
            render: (row) => row.errorMessage ?? '—',
            className: 'max-w-[14rem] truncate',
          },
          {
            key: 'externalApiPath',
            header: 'API path',
            hideOnMobile: true,
            render: (row) => (
              <span className="font-mono text-[11px] max-w-[11rem] truncate block">
                {row.externalApiPath ?? '—'}
              </span>
            ),
          },
          {
            key: 'partnerIp',
            header: 'Partner IP',
            hideOnMobile: true,
            render: (row) => row.partnerIp ?? '—',
            className: 'font-mono text-xs',
          },
          {
            key: 'actions',
            header: 'Actions',
            render: (row) => (
              <Button type="button" variant="secondary" onClick={() => setSelected(row)}>
                View
              </Button>
            ),
          },
        ]}
        data={sortedRows}
        isLoading={listLoading}
        page={filters.page}
        totalPages={totalPages}
        onPageChange={(p) => setFilters((f) => ({ ...f, page: p }))}
        onRowClick={(row) => setSelected(row)}
        emptyMessage="No order logs in this period"
      />

      <div className="flex flex-wrap items-center gap-3 text-sm text-text-muted">
        <span>
          {(listData?.total ?? 0).toLocaleString()} entries
          {listData ? ` · Page ${filters.page} / ${totalPages}` : ''}
        </span>
        <Select
          label="Rows per page"
          labelClassName="text-xs text-text-muted sr-only"
          rootClassName="gap-1 flex-row items-center"
          className="!min-h-9 !py-1.5 min-w-[5rem]"
          options={[
            { value: '10', label: '10' },
            { value: '20', label: '20' },
            { value: '50', label: '50' },
            { value: '100', label: '100' },
          ]}
          value={String(filters.limit)}
          onChange={(e) =>
            setFilters((f) => ({
              ...f,
              limit: Number(e.target.value),
              page: 1,
            }))
          }
        />
      </div>

      {drawerOpen && meta && (
        <FiltersDrawer
          meta={meta}
          draft={draft}
          setDraft={setDraft}
          onClose={() => setDrawerOpen(false)}
          onApply={() => {
            setFilters({ ...draft, page: 1 });
            setDrawerOpen(false);
          }}
        />
      )}

      {selected && (
        <ApplicationLogDetailModal
          row={selected}
          staffPrefix={staffPrefix}
          onClose={() => setSelected(null)}
          onRefresh={() => {
            void queryClient.invalidateQueries({ queryKey: keys.ordersLogsScope });
          }}
        />
      )}
    </div>
  );
}

function FiltersDrawer({
  meta,
  draft,
  setDraft,
  onClose,
  onApply,
}: {
  meta: MetaResponse;
  draft: OrdersLogsFilters;
  setDraft: React.Dispatch<React.SetStateAction<OrdersLogsFilters>>;
  onClose: () => void;
  onApply: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        className="absolute inset-0 bg-overlay"
        aria-label="Close filters"
        onClick={onClose}
      />
      <div
        className={cn(
          'relative h-full w-full max-w-md bg-bg-card border-l border-border-primary shadow-xl',
          'flex flex-col animate-fade-in',
        )}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-primary">
          <h2 className="text-lg font-semibold text-text-primary">Filters</h2>
          <Button type="button" variant="ghost" onClick={onClose} aria-label="Close">
            <X size={18} />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <Select
            label="Request kind"
            options={[
              { value: '', label: 'All' },
              { value: DirectionType.PAYIN, label: 'Pay-In' },
              { value: DirectionType.PAYOUT, label: 'Pay-Out' },
            ]}
            value={draft.kind}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                kind: e.target.value as OrdersLogsFilters['kind'],
              }))
            }
          />
          <Select
            label="Partner"
            options={[
              { value: '', label: 'All partners' },
              ...meta.merchants.map((m) => ({ value: m.id, label: m.name })),
            ]}
            value={draft.merchantId}
            onChange={(e) => setDraft((d) => ({ ...d, merchantId: e.target.value }))}
          />
          <Select
            label="Trader"
            options={[
              { value: '', label: 'All traders' },
              ...meta.traders.map((t) => ({ value: t.id, label: t.email })),
            ]}
            value={draft.traderId}
            onChange={(e) => setDraft((d) => ({ ...d, traderId: e.target.value }))}
          />
          <Select
            label="Currency"
            options={[{ value: '', label: 'All' }, ...meta.currencies.map((c) => ({ value: c, label: c }))]}
            value={draft.currency}
            onChange={(e) => setDraft((d) => ({ ...d, currency: e.target.value }))}
          />
          <Select
            label="UI status"
            options={[
              { value: '', label: 'All' },
              { value: ApplicationLogUiStatus.SUCCESS, label: 'Success' },
              { value: ApplicationLogUiStatus.ERROR, label: 'Error' },
              { value: ApplicationLogUiStatus.PENDING, label: 'Pending' },
            ]}
            value={draft.uiStatus}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                uiStatus: e.target.value as OrdersLogsFilters['uiStatus'],
              }))
            }
          />
          <Select
            label="Error code"
            options={[{ value: '', label: 'Any' }, ...meta.errorCodes.map((c) => ({ value: c, label: c }))]}
            value={draft.errorCode}
            onChange={(e) => setDraft((d) => ({ ...d, errorCode: e.target.value }))}
          />
          <FilterInput
            label="Partner IP contains"
            value={draft.partnerIp}
            onChange={(v) => setDraft((d) => ({ ...d, partnerIp: v }))}
          />
          <FilterInput
            label="Amount min"
            type="number"
            value={draft.amountMin}
            onChange={(v) => setDraft((d) => ({ ...d, amountMin: v }))}
          />
          <FilterInput
            label="Amount max"
            type="number"
            value={draft.amountMax}
            onChange={(v) => setDraft((d) => ({ ...d, amountMax: v }))}
          />
        </div>
        <div className="p-4 border-t border-border-primary flex gap-2 justify-end">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={onApply}>
            Apply
          </Button>
        </div>
      </div>
    </div>
  );
}

type OrderDetail = Record<string, unknown>;

function ApplicationLogDetailModal({
  row,
  staffPrefix,
  onClose,
  onRefresh,
}: {
  row: ApplicationLogRow;
  staffPrefix: StaffRolePrefix;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const keys = staffPrefix === 'admin' ? adminKeys : ownerKeys;
  const typeParam =
    row.kind === 'PAYOUT' ? DirectionType.PAYOUT : DirectionType.PAYIN;

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: keys.orderDetails(`${row.id}:${typeParam}`),
    queryFn: () =>
      api.get<OrderDetail>(
        `${internalPaths.adminOrder(row.id)}?type=${encodeURIComponent(typeParam)}`,
      ),
  });

  const hideAssignment = Boolean(data?.applicationLogHideAssignmentSections);
  const payment = data?.paymentDetails as Record<string, unknown> | null | undefined;
  const stakeholders = data?.stakeholderAmounts as Record<string, unknown> | null | undefined;
  const err = data?.applicationLogError as
    | { code?: string; message?: string; detail?: string | null; at?: string }
    | null
    | undefined;
  const history = data?.statusHistory as
    | Array<{ status: string; timestamp: string; actor: string }>
    | undefined;

  return (
    <Modal
      open
      onClose={onClose}
      title="Order details"
      subtitle={row.requestId}
      size="xl"
      variant="fullscreen"
      bodyClassName="space-y-6"
    >
      {isLoading ? (
        <p className="text-text-muted text-sm">Loading…</p>
      ) : (
        <>
          <section className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <DetailRow label="Order ID" value={String(data?.id ?? '')} mono />
            <DetailRow label="Status" value={String(data?.status ?? '')} />
            <DetailRow
              label="Application status"
              value={String(data?.applicationLogUiStatus ?? '')}
            />
            <DetailRow
              label="Amount"
              value={`${Number(data?.amount ?? 0).toLocaleString()} ${String(data?.currency ?? '')}`}
            />
            <DetailRow
              label="Received"
              value={
                data?.createdAt ? formatDateTime(new Date(String(data.createdAt))) : '—'
              }
            />
            <DetailRow
              label="Partner IP"
              value={String(data?.partnerIp ?? '—')}
              mono
            />
            <DetailRow
              label="API path"
              value={String(data?.externalApiPath ?? '—')}
              mono
            />
          </section>

          {err && (
            <section className="rounded-lg border border-accent-red/40 bg-accent-red/10 p-4 space-y-1">
              <h4 className="text-sm font-semibold text-accent-red">Error details</h4>
              <p className="text-xs font-mono text-text-primary">{err.code}</p>
              <p className="text-sm text-text-primary">{err.message}</p>
              {err.detail && (
                <p className="text-xs text-text-muted">{err.detail}</p>
              )}
              {err.at && (
                <p className="text-xs text-text-muted">
                  {formatDateTime(new Date(err.at))}
                </p>
              )}
            </section>
          )}

          {!hideAssignment && payment && (
            <section className="space-y-2">
              <h4 className="text-sm font-semibold text-text-primary">Payment details</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                <DetailRow label="Type" value={String(payment.requisiteType ?? payment.paymentMethodLabel ?? '—')} />
                <DetailRow label="Number" value={String(payment.number ?? '—')} mono />
                <DetailRow label="Owner" value={String(payment.owner ?? '—')} />
                <DetailRow
                  label="Card holder name"
                  value={String(payment.cardHolderName ?? '—')}
                />
                <DetailRow label="Bank" value={String(payment.bankName ?? '—')} />
                {payment.requisiteId != null && (
                  <DetailRow label="Requisite ID" value={String(payment.requisiteId)} mono />
                )}
              </div>
            </section>
          )}

          {!hideAssignment && stakeholders && (
            <section className="space-y-2">
              <h4 className="text-sm font-semibold text-text-primary">Stakeholder amounts</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                {(['partner', 'trader', 'platform'] as const).map((k) => {
                  const block = stakeholders[k] as Record<string, unknown> | null | undefined;
                  if (!block) return null;
                  return (
                    <div
                      key={k}
                      className="rounded-lg border border-border-primary bg-bg-secondary p-3 space-y-1 capitalize"
                    >
                      <div className="font-semibold text-text-primary">{k}</div>
                      <div className="text-text-muted">{String(block.label ?? '—')}</div>
                      <div className="tabular-nums">
                        {block.amountLocal != null
                          ? `${Number(block.amountLocal).toLocaleString()} (local)`
                          : '—'}
                      </div>
                      {block.percent != null && (
                        <div className="text-text-muted">
                          Fee %: {Number(block.percent).toLocaleString()}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          <section className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm font-semibold text-text-primary">Status history</h4>
              <Button
                type="button"
                variant="secondary"
                disabled={isFetching}
                onClick={() => void refetch().then(() => onRefresh())}
              >
                Refresh
              </Button>
            </div>
            <ul className="space-y-2 max-h-56 overflow-y-auto text-sm">
              {(history ?? []).map((h, idx) => (
                <li
                  key={`${h.timestamp}-${idx}`}
                  className="flex flex-wrap gap-2 items-center border border-border-primary rounded-md px-3 py-2"
                >
                  <Badge variant="muted">{h.status}</Badge>
                  <span className="text-text-muted">{h.actor}</span>
                  <span className="tabular-nums text-xs text-text-muted">
                    {formatDateTime(new Date(h.timestamp))}
                  </span>
                </li>
              ))}
              {(!history || history.length === 0) && (
                <li className="text-text-muted text-sm">No audit entries for this order.</li>
              )}
            </ul>
          </section>

          <div className="flex justify-end pt-2">
            <Button type="button" onClick={onClose}>
              Close
            </Button>
          </div>
        </>
      )}
    </Modal>
  );
}

function DetailRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-text-muted">{label}</div>
      <div className={cn('text-text-primary break-all', mono && 'font-mono text-xs')}>{value}</div>
    </div>
  );
}
