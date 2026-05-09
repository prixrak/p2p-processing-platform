'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { GitFork, AlertTriangle, ListFilter } from 'lucide-react';
import { api } from '@/lib/api';
import { internalPaths } from '@/lib/internal-api';
import { adminKeys, cascadeKeys, currencyKeys, fetchCurrencyList } from '@/lib/query-keys';
import { Select, type SelectOption } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import { LimitUsageBar } from '@/components/ui/limit-usage-bar';
import { cn } from '@/lib/utils';

type StaffCabinetPrefix = 'admin' | 'owner' | 'support';

export type RequisiteRatingApiRow = {
  requisite_id: string;
  trader_id: string;
  trader_label: string;
  processing_method: string;
  requisite_masked: string;
  is_active: boolean;
  is_in_cascade_pool: boolean;
  fill_ratio: number;
  fill_ratio_tx: number;
  rating: number;
  weighted_score: number;
  used_amount: number;
  limit_total_amount: number;
  used_ops: number;
  limit_total_ops: number;
  remaining_amount: number;
  manual_min_amount: number;
  manual_max_amount: number;
  effective_min: number | null;
  effective_max: number | null;
  autolimit_active: boolean;
  auto_min_amount: number | null;
  auto_max_amount: number | null;
  cascade_rank: number | null;
  is_eligible_preview: boolean;
  is_locked: boolean;
  last_assigned_at: string | null;
  last_assignment_order_id: string | null;
  assignments_count: number;
  composite_status: 'ACTIVE' | 'LOCKED' | 'INELIGIBLE' | 'DISABLED';
  autolimit_badge: boolean;
  fill_high: boolean;
};

type RatingResponse = {
  currency: string;
  /** Present when the client requested amount-based rank/eligibility preview. */
  preview_amount: number | null;
  rows: RequisiteRatingApiRow[];
};

function compactAmt(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function CascadeUsageRangeBlock({
  row,
  currencyCode,
}: {
  row: RequisiteRatingApiRow;
  currencyCode: string;
}) {
  const lim = Math.max(0, row.limit_total_amount);
  const usedRaw = Math.max(0, row.used_amount);
  const usedAmt = lim > 0 ? Math.min(usedRaw, lim) : usedRaw;
  const remainingAmt =
    lim > 0 ? Math.max(0, lim - usedAmt) : Math.max(0, row.remaining_amount);

  const amountTooltip = (
    <div className="space-y-1 text-left text-xs">
      <div>
        <span className="text-text-muted">Current amount ({currencyCode}): </span>
        <span className="font-medium tabular-nums text-text-primary">
          {usedRaw.toLocaleString(undefined, { maximumFractionDigits: 2 })}
        </span>
      </div>
      <div>
        <span className="text-text-muted">Limit: </span>
        <span className="font-medium tabular-nums text-text-primary">
          {lim.toLocaleString(undefined, { maximumFractionDigits: 2 })}
        </span>
      </div>
      <div>
        <span className="text-text-muted">Remaining: </span>
        <span className="font-medium tabular-nums text-text-primary">
          {remainingAmt.toLocaleString(undefined, { maximumFractionDigits: 2 })}
        </span>
      </div>
      <div className="text-text-muted">
        Fill (amount): {(row.fill_ratio * 100).toFixed(1)}%
      </div>
      {row.fill_high ? (
        <div className="text-amber-200">Fill ratio exceeds 80% — monitor headroom.</div>
      ) : null}
    </div>
  );

  return (
    <div className="min-w-[160px] max-w-[260px]">
      <div className="flex min-w-0 items-center gap-1.5">
        <LimitUsageBar
          used={usedAmt}
          limit={lim}
          usedSegmentLabel={compactAmt(usedAmt)}
          remainingSegmentLabel={compactAmt(remainingAmt)}
          tooltip={amountTooltip}
          className="min-w-0 flex-1"
        />
        {row.fill_high ? (
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-400" aria-hidden />
        ) : null}
      </div>
    </div>
  );
}

function CascadeOperationsLimitCell({ row }: { row: RequisiteRatingApiRow }) {
  const limOps = Math.max(1, row.limit_total_ops);
  const usedOpsClamped = Math.max(0, Math.min(row.used_ops, limOps));
  const remOps = Math.max(0, limOps - usedOpsClamped);

  const opsTooltip = (
    <div className="space-y-1 text-left text-xs">
      <div>
        <span className="text-text-muted">Operations used: </span>
        <span className="tabular-nums font-medium text-text-primary">{usedOpsClamped}</span>
      </div>
      <div>
        <span className="text-text-muted">Operations limit: </span>
        <span className="tabular-nums font-medium text-text-primary">{limOps}</span>
      </div>
      <div>
        <span className="text-text-muted">Remaining: </span>
        <span className="tabular-nums font-medium text-text-primary">{remOps}</span>
      </div>
      <div className="text-text-muted">
        Fill (transactions): {(row.fill_ratio_tx * 100).toFixed(1)}%
      </div>
    </div>
  );

  return (
    <div className="min-w-[7rem] max-w-[10rem]">
      <LimitUsageBar
        used={usedOpsClamped}
        limit={limOps}
        usedSegmentLabel={String(usedOpsClamped)}
        remainingSegmentLabel={String(remOps)}
        tooltip={opsTooltip}
        size="sm"
      />
    </div>
  );
}

/** Keeps filter controls from stretching to full row (Select defaults to w-full). */
const FILTER_SELECT_ROOT = 'w-auto min-w-0 shrink-0';
const FILTER_SELECT_TRIGGER = '!h-9 !min-h-9 !py-0 !text-xs';

function statusBadgeClass(s: RequisiteRatingApiRow['composite_status']): string {
  switch (s) {
    case 'ACTIVE':
      return 'bg-emerald-500/15 text-emerald-200 border-emerald-500/40';
    case 'LOCKED':
      return 'bg-sky-500/15 text-sky-200 border-sky-500/40';
    case 'INELIGIBLE':
      return 'bg-amber-500/15 text-amber-200 border-amber-500/40';
    case 'DISABLED':
    default:
      return 'bg-zinc-500/15 text-zinc-300 border-zinc-500/40';
  }
}

export function CascadeRequisiteRatingsPanel({
  staffBase,
  subtitle,
}: {
  staffBase: StaffCabinetPrefix;
  subtitle?: string;
}) {
  const [currency, setCurrency] = useState('UAH');
  const [previewAmount, setPreviewAmount] = useState('');
  const [method, setMethod] = useState<'ALL' | 'CARD' | 'FORK'>('ALL');
  const [statusFilter, setStatusFilter] = useState<
    'active' | 'all' | 'locked' | 'ineligible' | 'disabled'
  >('active');
  const [autolimit, setAutolimit] = useState<'all' | 'on' | 'off'>('all');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<'rank' | 'rating' | 'trader' | 'remainder' | 'status'>(
    'rank',
  );
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const sortPacked = `${sort}|${sortDir}`;

  const sortPackOptions: SelectOption[] = useMemo(
    () => [
      { label: 'Cascade rank · low first', value: 'rank|asc' },
      { label: 'Cascade rank · high first', value: 'rank|desc' },
      { label: 'Rating · high first', value: 'rating|desc' },
      { label: 'Rating · low first', value: 'rating|asc' },
      { label: 'Trader A → Z', value: 'trader|asc' },
      { label: 'Trader Z → A', value: 'trader|desc' },
      { label: 'Remainder · small first', value: 'remainder|asc' },
      { label: 'Remainder · large first', value: 'remainder|desc' },
      { label: 'Status A → Z', value: 'status|asc' },
      { label: 'Status Z → A', value: 'status|desc' },
    ],
    [],
  );

  const onSortPackChange = (packed: string) => {
    const [s, d] = packed.split('|');
    if (
      s === 'rank' ||
      s === 'rating' ||
      s === 'trader' ||
      s === 'remainder' ||
      s === 'status'
    ) {
      setSort(s);
    }
    if (d === 'asc' || d === 'desc') setSortDir(d);
  };

  const [traderIdFilter, setTraderIdFilter] = useState('');
  const [detailRequisiteId, setDetailRequisiteId] = useState<string | null>(null);

  const currenciesQ = useQuery({
    queryKey: currencyKeys.list(),
    queryFn: fetchCurrencyList,
  });

  const currencyOptions: SelectOption[] = useMemo(() => {
    const rows = currenciesQ.data ?? [];
    const active = rows.filter((c) => c.isActive);
    const source = active.length > 0 ? active : rows;
    return source
      .slice()
      .sort((a, b) => a.code.localeCompare(b.code))
      .map((c) => ({ label: c.code.trim().toUpperCase(), value: c.code.trim().toUpperCase() }));
  }, [currenciesQ.data]);

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    p.set('currency', currency);
    const pa = previewAmount.trim();
    if (pa !== '' && !Number.isNaN(Number(pa))) p.set('preview_amount', pa);
    if (method !== 'ALL') p.set('method', method);
    p.set('status', statusFilter);
    if (autolimit !== 'all') p.set('autolimit', autolimit);
    if (q.trim()) p.set('q', q.trim());
    if (traderIdFilter.trim()) p.set('trader_id', traderIdFilter.trim());
    p.set('sort', sort);
    p.set('sort_dir', sortDir);
    return p.toString();
  }, [
    autolimit,
    currency,
    method,
    previewAmount,
    q,
    sort,
    sortDir,
    statusFilter,
    traderIdFilter,
  ]);

  const tradersQ = useQuery({
    queryKey: adminKeys.tradersOptions(),
    queryFn: async () => {
      const res = await api.get<{
        data: Array<{ id: string; user: { email: string } }>;
      }>(`${internalPaths.traders}?page=1&limit=500`);
      return res.data.map((t) => ({ id: t.id, label: t.user.email }));
    },
  });

  const traderFilterOptions: SelectOption[] = useMemo(
    () => [
      { value: '', label: 'All traders' },
      ...(tradersQ.data ?? []).map((t) => ({
        value: t.id,
        label: t.label,
      })),
    ],
    [tradersQ.data],
  );

  const ratingsQ = useQuery({
    queryKey: cascadeKeys.requisiteRatings(currency, qs),
    queryFn: () =>
      api.get<RatingResponse>(
        `${internalPaths.adminCascadeRequisiteRatingsBase}?${qs}`,
      ),
    refetchInterval: 4000,
  });

  const data = ratingsQ.data;

  const requisiteDetailQ = useQuery({
    queryKey: ['requisite-detail', detailRequisiteId],
    queryFn: () =>
      api.get<{
        id: string;
        number: string;
        owner: string;
        isActive: boolean;
        minAmount: string;
        maxAmount: string;
        limitTotalAmount: string;
        limitTotalOps: number;
        usedAmount: string;
        usedOps: number;
        type: string;
        bank?: { name: string } | null;
        currency: { code: string };
        trader?: { user?: { email: string } };
      }>(internalPaths.requisite(detailRequisiteId!)),
    enabled: !!detailRequisiteId,
  });

  return (
    <div className="mx-auto max-w-[1800px] space-y-3 p-4 sm:space-y-4 sm:p-6">
      <div className="flex items-center gap-3">
        <GitFork className="h-8 w-8 text-accent" />
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Cascade requisites</h1>
          <p className="text-sm text-text-secondary">
            {subtitle ??
              'Live requisite metrics, cascade rank preview, and assignment telemetry (polls every 4s).'}
          </p>
        </div>
      </div>

      <section className="rounded-xl border border-border-primary bg-surface-secondary px-3 py-2.5 sm:px-4">
        <div className="mb-2 flex flex-wrap items-center gap-2 border-b border-border-primary/50 pb-2">
          <ListFilter className="h-4 w-4 shrink-0 text-text-muted" aria-hidden />
          <h2 className="text-xs font-semibold uppercase tracking-wide text-text-muted">
            Filters
          </h2>
          {data ? (
            <span className="text-[11px] text-text-muted">
              {data.preview_amount != null ? (
                <>
                  Cascade rank and eligibility preview at{' '}
                  <span className="font-mono text-text-secondary">
                    {data.preview_amount} {currency.trim().toUpperCase()}
                  </span>
                  {' '}
                  (table defaults to assignment order — rank 1 first).
                </>
              ) : (
                <>
                  No preview amount — all cascade pool requisites are listed. Enter Preview amt.
                  to see rank and eligibility for that amount (rank column uses the cached snapshot
                  order until then).
                </>
              )}
            </span>
          ) : null}
        </div>
        <div className="grid grid-cols-2 gap-x-2 gap-y-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          <Select
            rootClassName={FILTER_SELECT_ROOT}
            className={FILTER_SELECT_TRIGGER}
            label="Currency"
            labelClassName="sr-only"
            options={currencyOptions}
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            disabled={currencyOptions.length === 0}
            placeholder={currenciesQ.isLoading ? 'Loading…' : '—'}
          />
          <div className="flex min-w-0 flex-col gap-1">
            <label htmlFor="cascade-preview-amt" className="sr-only">
              Preview amount
            </label>
            <span className="text-[10px] leading-none text-text-muted">Preview amt.</span>
            <Input
              id="cascade-preview-amt"
              className="h-9 min-w-0 text-xs"
              placeholder={
                data ? (data.preview_amount != null ? String(data.preview_amount) : 'Optional') : '…'
              }
              value={previewAmount}
              onChange={(e) => setPreviewAmount(e.target.value)}
            />
          </div>
          <Select
            rootClassName={FILTER_SELECT_ROOT}
            className={FILTER_SELECT_TRIGGER}
            label="Method"
            labelClassName="sr-only"
            options={[
              { label: 'All methods', value: 'ALL' },
              { label: 'CARD', value: 'CARD' },
              { label: 'FORK', value: 'FORK' },
            ]}
            value={method}
            onChange={(e) => setMethod(e.target.value as typeof method)}
          />
          <Select
            rootClassName={FILTER_SELECT_ROOT}
            className={FILTER_SELECT_TRIGGER}
            label="Status"
            labelClassName="sr-only"
            options={[
              { label: 'Active', value: 'active' },
              { label: 'All', value: 'all' },
              { label: 'Locked', value: 'locked' },
              { label: 'Ineligible', value: 'ineligible' },
              { label: 'Disabled', value: 'disabled' },
            ]}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
          />
          <Select
            rootClassName={FILTER_SELECT_ROOT}
            className={FILTER_SELECT_TRIGGER}
            label="Autolimit"
            labelClassName="sr-only"
            options={[
              { label: 'Autolimit: any', value: 'all' },
              { label: 'Autolimit: on', value: 'on' },
              { label: 'Autolimit: off', value: 'off' },
            ]}
            value={autolimit}
            onChange={(e) => setAutolimit(e.target.value as typeof autolimit)}
          />
          <div className="min-w-0 sm:col-span-2">
            <label htmlFor="cascade-q" className="sr-only">
              Search traders or requisites
            </label>
            <span className="text-[10px] leading-none text-text-muted">Search</span>
            <Input
              id="cascade-q"
              className="mt-1 h-9 w-full text-xs"
              placeholder="Trader, requisite…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <Select
            rootClassName={cn(FILTER_SELECT_ROOT, 'min-w-[12rem] lg:col-span-2')}
            className={FILTER_SELECT_TRIGGER}
            label="Sort"
            labelClassName="sr-only"
            options={sortPackOptions}
            value={sortPacked}
            onChange={(e) => onSortPackChange(e.target.value)}
          />
          <Select
            rootClassName={cn(FILTER_SELECT_ROOT, 'min-w-[12rem] xl:col-span-2')}
            className={FILTER_SELECT_TRIGGER}
            label="Trader"
            labelClassName="sr-only"
            options={traderFilterOptions}
            value={traderIdFilter}
            onChange={(e) => setTraderIdFilter(e.target.value)}
            disabled={tradersQ.isLoading}
          />
        </div>
      </section>

      <section className="overflow-x-auto rounded-xl border border-border-primary bg-surface-secondary">
        <table className="w-full min-w-[920px] text-left text-sm">
          <thead>
            <tr className="border-b border-border-primary text-text-muted">
              <th className="px-3 py-2">Rank</th>
              <th className="px-3 py-2">Trader</th>
              <th className="px-3 py-2">Requisite</th>
              <th className="min-w-[6.5rem] px-3 py-2">Amount range</th>
              <th className="min-w-[180px] px-3 py-2">Amount limit & assignment range</th>
              <th className="min-w-[7.5rem] px-3 py-2">Operation limit</th>
              <th className="px-3 py-2">Rating</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Autolimit</th>
              <th className="px-3 py-2">Last assign</th>
            </tr>
          </thead>
          <tbody>
            {ratingsQ.isLoading ? (
              <tr>
                <td colSpan={10} className="px-3 py-8 text-center text-text-muted">
                  Loading…
                </td>
              </tr>
            ) : ratingsQ.isError ? (
              <tr>
                <td colSpan={10} className="px-3 py-8 text-center text-red-400">
                  Failed to load
                </td>
              </tr>
            ) : (
              (data?.rows ?? []).map((row) => (
                <tr
                  key={row.requisite_id}
                  className={cn(
                    'border-b border-border-primary/50 hover:bg-bg-tertiary/30',
                    row.is_locked && 'animate-pulse',
                  )}
                >
                  <td className="px-3 py-2 align-middle font-mono text-text-primary">
                    {row.cascade_rank ?? '—'}
                  </td>
                  <td className="px-3 py-2 align-middle">
                    <div className="flex flex-wrap items-center gap-1">
                      <span className="text-text-primary">{row.trader_label}</span>
                      <Badge variant="muted" className="font-mono text-[10px]">
                        {row.processing_method}
                      </Badge>
                    </div>
                  </td>
                  <td className="px-3 py-2 align-middle font-mono text-text-secondary">
                    <button
                      type="button"
                      className="text-left text-accent-blue underline-offset-2 hover:underline"
                      onClick={() => setDetailRequisiteId(row.requisite_id)}
                    >
                      {row.requisite_masked}
                    </button>
                  </td>
                  <td className="px-3 py-2 align-middle font-mono text-xs text-text-secondary">
                    <span
                      className="tabular-nums whitespace-nowrap"
                      title="Configured min / max amounts on requisite (manual limits)"
                    >
                      {compactAmt(row.manual_min_amount)} ↔ {compactAmt(row.manual_max_amount)}
                    </span>
                  </td>
                  <td className="px-3 py-2 align-middle">
                    <CascadeUsageRangeBlock
                      row={row}
                      currencyCode={currency.trim().toUpperCase()}
                    />
                  </td>
                  <td className="px-3 py-2 align-middle">
                    <CascadeOperationsLimitCell row={row} />
                  </td>
                  <td className="px-3 py-2 align-middle font-mono">{row.rating}</td>
                  <td className="px-3 py-2 align-middle">
                    <div className="flex flex-wrap gap-1">
                      <span
                        className={cn(
                          'rounded border px-2 py-0.5 text-[11px] font-medium',
                          statusBadgeClass(row.composite_status),
                        )}
                      >
                        {row.composite_status}
                        {row.is_locked ? ' · lock' : ''}
                      </span>
                      {row.autolimit_badge ? (
                        <span className="rounded border border-violet-500/50 bg-violet-500/10 px-2 py-0.5 text-[11px] text-violet-200">
                          autolimit
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td className="max-w-[140px] px-3 py-2 align-middle font-mono text-xs text-text-muted">
                    {row.processing_method === 'FORK' && row.autolimit_badge ? (
                      <>
                        {row.auto_min_amount != null ? row.auto_min_amount.toFixed(0) : '—'} /{' '}
                        {row.auto_max_amount != null ? row.auto_max_amount.toFixed(0) : '—'}
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-3 py-2 align-middle text-xs text-text-secondary">
                    {row.last_assigned_at ? (
                      <div className="flex flex-col gap-0.5">
                        <time dateTime={row.last_assigned_at}>
                          {new Date(row.last_assigned_at).toLocaleString()}
                        </time>
                        {row.last_assignment_order_id ? (
                          <Link
                            href={`/${staffBase}/orders?orderId=${encodeURIComponent(row.last_assignment_order_id)}`}
                            className="font-mono text-accent-blue hover:underline"
                            title="Open order details"
                          >
                            {row.last_assignment_order_id.slice(0, 8)}…
                          </Link>
                        ) : null}
                        <span className="text-text-muted">n={row.assignments_count}</span>
                      </div>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      <Modal
        open={!!detailRequisiteId}
        onClose={() => setDetailRequisiteId(null)}
        title="Requisite details"
        className="max-w-lg"
      >
        {requisiteDetailQ.isLoading ? (
          <p className="text-sm text-text-muted">Loading…</p>
        ) : requisiteDetailQ.data ? (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="text-xs text-text-muted">Currency</p>
                <p className="font-mono">{requisiteDetailQ.data.currency.code}</p>
              </div>
              <div>
                <p className="text-xs text-text-muted">Active</p>
                <p>{requisiteDetailQ.data.isActive ? 'Yes' : 'No'}</p>
              </div>
            </div>
            <div>
              <p className="text-xs text-text-muted">Number</p>
              <p className="font-mono break-all">{requisiteDetailQ.data.number}</p>
            </div>
            <div>
              <p className="text-xs text-text-muted">Owner</p>
              <p>{requisiteDetailQ.data.owner}</p>
            </div>
            {requisiteDetailQ.data.bank?.name ? (
              <div>
                <p className="text-xs text-text-muted">Bank</p>
                <p>{requisiteDetailQ.data.bank.name}</p>
              </div>
            ) : null}
            <div className="grid grid-cols-2 gap-2 font-mono text-xs text-text-secondary">
              <span>Used / limit: {requisiteDetailQ.data.usedAmount} / {requisiteDetailQ.data.limitTotalAmount}</span>
              <span>Ops: {requisiteDetailQ.data.usedOps} / {requisiteDetailQ.data.limitTotalOps}</span>
            </div>
          </div>
        ) : (
          <p className="text-sm text-red-400">Could not load requisite.</p>
        )}
      </Modal>
    </div>
  );
}
