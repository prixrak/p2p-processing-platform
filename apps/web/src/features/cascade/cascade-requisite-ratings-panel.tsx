'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { GitFork, AlertTriangle, Info, ListFilter } from 'lucide-react';
import type {
  CascadeAssignmentExplainResponse,
  CascadeStaffRequisiteRatingRow,
  CascadeStaffRequisiteRatingsResponse,
  CascadeTraderUsdtCapacityRow,
} from '@p2p/shared';
import { api } from '@/lib/api';
import {
  useDebouncedTextFilter,
  useDebouncedValue,
} from '@/lib/hooks/use-debounced-value';
import { internalPaths } from '@/lib/internal-api';
import { adminKeys, cascadeKeys, currencyKeys, fetchCurrencyList } from '@/lib/query-keys';
import { Select, type SelectOption } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Modal } from '@/components/ui/modal';
import { LimitUsageBar } from '@/components/ui/limit-usage-bar';
import { Tooltip } from '@/components/ui/tooltip';
import { cn, formatDateTime } from '@/lib/utils';

type StaffCabinetPrefix = 'admin' | 'owner' | 'support';

/** @deprecated Use `CascadeStaffRequisiteRatingRow` from `@p2p/shared`. */
export type RequisiteRatingApiRow = CascadeStaffRequisiteRatingRow;

function compactAmt(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function formatIdleMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  if (ms >= 86400000) return `${Math.floor(ms / 86400000)}d`;
  if (ms >= 3600000) return `${Math.floor(ms / 3600000)}h`;
  if (ms >= 60000) return `${Math.floor(ms / 60000)}m`;
  if (ms >= 1000) return `${Math.floor(ms / 1000)}s`;
  if (ms > 0) return '<1s';
  return '0s';
}

function formatWeightedScore(n: number): string {
  if (!Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  // Keep full grouped integers for millions; compact only for billions+ so wide tables stay readable.
  if (abs >= 1_000_000_000) {
    return new Intl.NumberFormat(undefined, {
      notation: 'compact',
      maximumFractionDigits: 2,
    }).format(n);
  }
  if (abs >= 1_000_000) {
    return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  }
  return n.toLocaleString(undefined, { maximumFractionDigits: 3 });
}

function excludedReasonLabel(code: string): string {
  switch (code) {
    case 'INSUFFICIENT_AMOUNT_HEADROOM':
      return 'Headroom';
    case 'AMOUNT_OUTSIDE_EFFECTIVE_RANGE':
      return 'Effective range';
    case 'USDT_CAPACITY_INSUFFICIENT':
      return 'Overdraft / USDT capacity';
    case 'EFFECTIVE_BOUNDS_UNAVAILABLE':
      return 'Bounds';
    case 'LOWER_CASCADE_ORDER':
      return 'Lower priority';
    default:
      return code;
  }
}

function CascadeUsageRangeBlock({
  row,
  currencyCode,
}: {
  row: CascadeStaffRequisiteRatingRow;
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
      <div className="text-text-muted">Fill (amount): {(row.fill_ratio * 100).toFixed(1)}%</div>
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

function CascadeOperationsLimitCell({ row }: { row: CascadeStaffRequisiteRatingRow }) {
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

const FILTER_SELECT_ROOT = 'w-auto min-w-0 shrink-0';
const FILTER_SELECT_TRIGGER = '!h-9 !min-h-9 !py-0 !text-xs';

function statusBadgeClass(s: CascadeStaffRequisiteRatingRow['composite_status']): string {
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

function EngineContextBlock({
  ctx,
  currencyUpper,
  primaryLevel,
}: {
  ctx: CascadeAssignmentExplainResponse['cascade_context'];
  currencyUpper: string;
  primaryLevel: 'FORK' | 'CARD';
}) {
  return (
    <div className="space-y-2 text-xs leading-relaxed text-text-secondary">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="info" className="font-mono">
          {ctx.level_pick_mode}
        </Badge>
        <span>
          Targets: Fork {ctx.fork_traffic_percent}% / Card {ctx.card_traffic_percent}% / Provider{' '}
          {ctx.provider_traffic_percent}%
        </span>
      </div>
      <p>
        Autolimits: {ctx.autolimit_enabled ? 'on' : 'off'} @ {ctx.autolimit_threshold}
      </p>
      <p>
        DEBT credits: fork {ctx.fork_credit}, card {ctx.card_credit}, provider {ctx.provider_credit}
        {ctx.level_pick_mode === 'DEBT' && ctx.debt_primary_preview ? (
          <>
            {' '}
            → next tier-1 <strong className="text-text-primary">{ctx.debt_primary_preview}</strong>
          </>
        ) : null}
        {ctx.level_pick_mode === 'STOCHASTIC' ? (
          <span className="text-text-muted">
            {' '}
            · STOCHASTIC: first Fork vs Card tier is random per assignment (weighted by targets).
          </span>
        ) : null}
      </p>
      <p className="font-mono text-[11px] text-text-muted break-all">
        Redis snapshot amount: {ctx.redis_rank_preview_amount} {currencyUpper} · ladder fingerprint{' '}
        {ctx.fill_config_fingerprint.slice(0, 14)}…
      </p>
      <p className="text-text-muted">
        Tier-1 attempt order for this preview:{' '}
        <strong className="text-accent-blue">{primaryLevel}</strong>.
      </p>
    </div>
  );
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
  const debouncedPreviewAmount = useDebouncedValue(previewAmount, undefined, (v) => v.trim());
  const [method, setMethod] = useState<'ALL' | 'CARD' | 'FORK'>('ALL');
  const [statusFilter, setStatusFilter] = useState<
    'active' | 'all' | 'locked' | 'ineligible' | 'disabled'
  >('active');
  const [autolimit, setAutolimit] = useState<'all' | 'on' | 'off'>('all');
  const { value: q, setValue: setQ, debounced: debouncedQ } = useDebouncedTextFilter();
  const [sort, setSort] = useState<'rank' | 'rating' | 'trader' | 'remainder' | 'status'>(
    'rank',
  );
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const sortPacked = `${sort}|${sortDir}`;

  const sortPackOptions: SelectOption[] = useMemo(
    () => [
      { label: 'Cascade rank · low first', value: 'rank|asc' },
      { label: 'Cascade rank · high first', value: 'rank|desc' },
      { label: 'Race score · high first', value: 'rating|desc' },
      { label: 'Race score · low first', value: 'rating|asc' },
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

  const currencyUpper = currency.trim().toUpperCase();

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
    p.set('currency', currencyUpper);
    const pa = debouncedPreviewAmount;
    if (pa !== '' && !Number.isNaN(Number(pa))) p.set('preview_amount', pa);
    if (method !== 'ALL') p.set('method', method);
    p.set('status', statusFilter);
    if (autolimit !== 'all') p.set('autolimit', autolimit);
    if (debouncedQ) p.set('q', debouncedQ);
    if (traderIdFilter.trim()) p.set('trader_id', traderIdFilter.trim());
    p.set('sort', sort);
    p.set('sort_dir', sortDir);
    return p.toString();
  }, [
    autolimit,
    currencyUpper,
    method,
    debouncedPreviewAmount,
    debouncedQ,
    sort,
    sortDir,
    statusFilter,
    traderIdFilter,
  ]);

  const explainAmountKey = useMemo(() => {
    const t = debouncedPreviewAmount;
    if (t === '' || Number.isNaN(Number(t))) return 'default';
    return String(Number(t));
  }, [debouncedPreviewAmount]);

  const explainAmount =
    explainAmountKey === 'default' ? undefined : Number(explainAmountKey);

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
    queryKey: cascadeKeys.requisiteRatings(currencyUpper, qs),
    queryFn: () =>
      api.get<CascadeStaffRequisiteRatingsResponse>(
        `${internalPaths.adminCascadeRequisiteRatingsBase}?${qs}`,
      ),
    refetchInterval: 4000,
  });

  const explainQ = useQuery({
    queryKey: cascadeKeys.assignmentExplain(currencyUpper, explainAmountKey),
    queryFn: () =>
      api.get<CascadeAssignmentExplainResponse>(
        internalPaths.adminCascadeAssignmentExplain(currencyUpper, {
          amount: explainAmount,
          detailed: true,
        }),
      ),
    refetchInterval: 4000,
  });

  const data = ratingsQ.data;
  const explain = explainQ.data;

  const traderCapacityById = useMemo(() => {
    const map = new Map<string, CascadeTraderUsdtCapacityRow>();
    for (const row of data?.trader_usdt_capacity ?? []) {
      map.set(row.trader_id, row);
    }
    return map;
  }, [data?.trader_usdt_capacity]);

  const traderCapacityAlerts = data?.trader_usdt_capacity ?? [];

  const requisiteDetailQ = useQuery({
    queryKey: ['requisite-detail', detailRequisiteId],
    queryFn: () =>
      api.get<{
        id: string;
        number: string;
        owner: string;
        cardHolderName?: string | null;
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
    <div className="mx-auto max-w-[1800px] space-y-4 p-4 sm:space-y-5 sm:p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <GitFork className="h-8 w-8 shrink-0 text-accent" />
          <div>
            <h1 className="text-2xl font-semibold text-text-primary">Cascade requisites</h1>
            <p className="text-sm text-text-secondary">
              {subtitle ??
                'Pay-In cascade engine state, assignment queue preview, and per-requisite telemetry (polls every 4s).'}
            </p>
          </div>
        </div>
      </div>

      <Card title="How Pay-In cascade assigns" tone="neutral" className="bg-surface-secondary/80">
        <ul className="list-inside list-disc space-y-1.5 text-sm text-text-secondary">
          <li>
            <strong className="text-text-primary">Tier-1</strong> is Fork or Card: DEBT mode picks the
            under-served bucket from credits + target shares; STOCHASTIC mode rolls weighted dice each
            assignment.
          </li>
          <li>
            The engine tries <strong className="text-text-primary">primary tier first</strong>, then
            the other Fork/Card tier, then Provider (only if provider traffic is enabled and integrated).
          </li>
          <li>
            <strong className="text-text-primary">Inside each tier</strong>, eligible requisites are
            ordered by idle-time race score (higher idle × multipliers wins). Ties break by requisite id.
          </li>
          <li>
            <strong className="text-text-primary">Preview amount</strong> is optional: leave it{' '}
            <strong className="text-text-primary">empty</strong> to show candidates eligible for{' '}
            <strong className="text-text-primary">any</strong> active coverage nominal in both the assignment
            queue and the ratings table. Enter a Pay-In amount (including{' '}
            <strong className="text-text-primary">0</strong>) to simulate that exact amount only.
          </li>
        </ul>
      </Card>

      {explain ? (
        <Card title="Live engine (same rules as assignment)" tone="blue" className="bg-bg-tertiary/20">
          <EngineContextBlock
            ctx={explain.cascade_context}
            currencyUpper={currencyUpper}
            primaryLevel={explain.primary_cascade_level}
          />
        </Card>
      ) : explainQ.isLoading ? (
        <p className="text-sm text-text-muted">Loading assignment preview…</p>
      ) : null}

      <section className="rounded-xl border border-border-primary bg-surface-secondary px-3 py-2.5 sm:px-4">
        <div className="mb-2 flex flex-wrap items-center gap-2 border-b border-border-primary/50 pb-2">
          <ListFilter className="h-4 w-4 shrink-0 text-text-muted" aria-hidden />
          <h2 className="text-xs font-semibold uppercase tracking-wide text-text-muted">Filters</h2>
          {data ? (
            <span className="text-[11px] text-text-muted">
              {data.preview_amount != null ? (
                <>
                  Table ranks / eligibility at{' '}
                  <span className="font-mono text-text-secondary">
                    {data.preview_amount} {currencyUpper}
                  </span>
                  .
                </>
              ) : (
                <>
                  All coverage nominals ({currencyUpper}) — enter Preview amt. to simulate a specific
                  amount.
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
            value={currencyUpper}
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
              placeholder="Optional"
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

      {traderCapacityAlerts.length > 0 ? (
        <Card title="Trader USDT capacity alerts" tone="amber" className="bg-surface-secondary/80">
          <p className="mb-3 text-xs text-text-muted">
            Pay-In cascade blocks assignment when effective headroom (balance + overdraft − reserved
            open Pay-In debits) is insufficient. Traders listed here cannot receive new Pay-In until
            they top up or open orders settle.
          </p>
          <div className="overflow-x-auto rounded-lg border border-border-primary">
            <table className="w-full min-w-[720px] text-left text-xs">
              <thead className="bg-surface-secondary">
                <tr className="border-b border-border-primary text-text-muted">
                  <th className="px-2 py-2">Trader</th>
                  <th className="px-2 py-2">Ledger USDT</th>
                  <th className="px-2 py-2">Overdraft</th>
                  <th className="px-2 py-2">Pending Pay-In</th>
                  <th className="px-2 py-2">Effective headroom</th>
                  <th className="px-2 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {traderCapacityAlerts.map((row) => (
                  <tr key={row.trader_id} className="border-b border-border-primary/40">
                    <td className="px-2 py-1.5 text-text-primary">{row.trader_label}</td>
                    <td className="px-2 py-1.5 font-mono tabular-nums">{row.balance_usdt}</td>
                    <td className="px-2 py-1.5 font-mono tabular-nums">{row.overdraft_limit_usdt}</td>
                    <td className="px-2 py-1.5 font-mono tabular-nums">
                      {row.pending_payin_debit_usdt}
                    </td>
                    <td className="px-2 py-1.5 font-mono tabular-nums">{row.available_usdt}</td>
                    <td className="px-2 py-1.5">
                      {row.capacity_exhausted ? (
                        <Badge variant="danger">Pay-In blocked</Badge>
                      ) : (
                        <Badge variant="warning">Low capacity</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      {explainQ.isError ? (
        <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          Could not load assignment preview. Check the API and try again.
        </p>
      ) : null}

      {explain ? (
        <Card
          title="Assignment queue"
          action={
            <Tooltip
              content="Order the engine would try before Redis locks and provider fallback. Matches tryAssignBatchTx tier order."
              wide
            >
              <button
                type="button"
                className="inline-flex text-text-muted hover:text-text-secondary"
                aria-label="Queue help"
              >
                <Info className="h-4 w-4" />
              </button>
            </Tooltip>
          }
          tone="neutral"
          className="bg-surface-secondary/80"
        >
          <div className="mb-3 flex flex-wrap items-center gap-2 text-sm text-text-secondary">
            <span>
              Amount evaluated:{' '}
              <strong className="tabular-nums text-text-primary">
                {explain.amount == null ? (
                  <>All coverage nominals ({currencyUpper})</>
                ) : (
                  <>
                    {explain.amount} {currencyUpper}
                  </>
                )}
              </strong>
            </span>
            {explain.amount_source === 'all_nominals' ? (
              <Badge variant="muted">All coverage nominals</Badge>
            ) : (
              <Badge variant="info">From preview field</Badge>
            )}
            {explainQ.isFetching ? (
              <span className="text-[11px] text-text-muted">Refreshing…</span>
            ) : null}
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {explain.tiers.map((tier) => (
              <div
                key={tier.level}
                className={cn(
                  'rounded-lg border p-3',
                  tier.primary
                    ? 'border-accent-blue/50 bg-accent-blue/5'
                    : 'border-border-primary bg-bg-tertiary/20',
                )}
              >
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm font-semibold text-text-primary">
                    {tier.level}
                  </span>
                  {tier.primary ? (
                    <Badge variant="info">Tried first</Badge>
                  ) : (
                    <Badge variant="muted">Fallback tier</Badge>
                  )}
                  <span className="text-xs text-text-muted">{tier.ranks.length} candidate(s)</span>
                </div>
                {tier.ranks.length === 0 ? (
                  <p className="text-xs text-text-muted">No eligible requisites in this tier.</p>
                ) : (
                  <ol className="space-y-2">
                    {tier.ranks.map((r) => (
                      <li
                        key={r.requisite_id}
                        className="flex flex-wrap items-baseline justify-between gap-2 rounded-md border border-border-primary/40 bg-surface-secondary/50 px-2 py-1.5 text-xs"
                      >
                        <div className="min-w-0">
                          <span className="font-mono font-semibold text-accent">#{r.rank}</span>{' '}
                          <span className="text-text-primary">{r.trader_label || r.trader_id}</span>
                          <span className="text-text-muted"> · </span>
                          <button
                            type="button"
                            className="font-mono text-accent-blue hover:underline"
                            onClick={() => setDetailRequisiteId(r.requisite_id)}
                          >
                            {r.requisite_masked}
                          </button>
                        </div>
                        <span
                          className="shrink-0 tabular-nums text-text-muted"
                          title="Race score for this tier"
                        >
                          score {formatWeightedScore(r.weighted_score)}
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <section className="overflow-x-auto rounded-xl border border-border-primary bg-surface-secondary">
        <h2 className="border-b border-border-primary px-3 py-2 text-sm font-semibold text-text-primary">
          All requisites (filtered)
        </h2>
        <table className="w-full min-w-[1280px] text-left text-sm">
          <thead>
            <tr className="border-b border-border-primary text-text-muted">
              <th className="px-3 py-2">Rank</th>
              <th className="px-3 py-2">Trader</th>
              <th className="px-3 py-2">Requisite</th>
              <th className="min-w-[6.5rem] px-3 py-2">Amount range</th>
              <th className="min-w-[180px] px-3 py-2">Amount limit</th>
              <th className="min-w-[7.5rem] px-3 py-2">Ops limit</th>
              <th
                className="px-2 py-2 text-[11px]"
                title="TZ display from amount fill (capacity bar)"
              >
                TZ %
              </th>
              <th className="px-2 py-2 text-[11px]" title="Idle ms since cascade anchor">
                Idle
              </th>
              <th className="px-2 py-2 text-[11px]" title="Confirmed Pay-In / limit">
                Cf%
              </th>
              <th
                className="min-w-[6.5rem] px-2 py-2 text-[11px]"
                title="Fork: ladder / leg / trader / effective. Card: —/—/trader/effective."
              >
                Race × chain
              </th>
              <th className="px-3 py-2" title="idle_ms × effective multiplier">
                Race score
              </th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Autolimit</th>
              <th className="px-3 py-2">Last assign</th>
            </tr>
          </thead>
          <tbody>
            {ratingsQ.isLoading ? (
              <tr>
                <td colSpan={14} className="px-3 py-8 text-center text-text-muted">
                  Loading…
                </td>
              </tr>
            ) : ratingsQ.isError ? (
              <tr>
                <td colSpan={14} className="px-3 py-8 text-center text-red-400">
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
                      {traderCapacityById.get(row.trader_id)?.capacity_exhausted ? (
                        <Badge variant="danger" title="Trader USDT capacity exhausted — Pay-In blocked">
                          USDT blocked
                        </Badge>
                      ) : traderCapacityById.get(row.trader_id)?.low_capacity ? (
                        <Badge variant="warning" title="Trader USDT headroom is low">
                          USDT low
                        </Badge>
                      ) : null}
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
                      title="Configured min / max (manual)"
                    >
                      {compactAmt(row.manual_min_amount)} ↔ {compactAmt(row.manual_max_amount)}
                    </span>
                  </td>
                  <td className="px-3 py-2 align-middle">
                    <CascadeUsageRangeBlock row={row} currencyCode={currencyUpper} />
                  </td>
                  <td className="px-3 py-2 align-middle">
                    <CascadeOperationsLimitCell row={row} />
                  </td>
                  <td className="px-2 py-2 align-middle font-mono text-xs tabular-nums text-text-secondary">
                    {row.rating}
                  </td>
                  <td
                    className="px-2 py-2 align-middle font-mono text-xs tabular-nums text-text-secondary"
                    title={`${row.idle_ms.toLocaleString()} ms`}
                  >
                    {formatIdleMs(row.idle_ms)}
                  </td>
                  <td className="px-2 py-2 align-middle font-mono text-xs tabular-nums text-text-secondary">
                    {(row.confirmed_fill_ratio * 100).toFixed(1)}%
                  </td>
                  <td
                    className="px-2 py-2 align-middle font-mono text-[11px] leading-tight text-text-muted"
                    title="Ladder / fill leg / trader mult / effective mult"
                  >
                    {row.processing_method === 'FORK' ? (
                      <>
                        {row.fill_ladder_multiplier ?? '—'}/{row.fill_leg_multiplier ?? '—'}/
                        {row.trader_multiplier}/{row.effective_race_multiplier}
                      </>
                    ) : (
                      <>
                        —/—/{row.trader_multiplier}/{row.effective_race_multiplier}
                      </>
                    )}
                  </td>
                  <td
                    className="px-3 py-2 align-middle font-mono text-xs tabular-nums text-text-primary"
                    title={`Race score (full): ${Number.isFinite(row.weighted_score) ? row.weighted_score.toLocaleString(undefined, { maximumFractionDigits: 6 }) : '—'}`}
                  >
                    {formatWeightedScore(row.weighted_score)}
                  </td>
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
                      {!row.is_in_cascade_pool ? (
                        <Badge variant="muted">outside pool</Badge>
                      ) : null}
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
                          {formatDateTime(new Date(row.last_assigned_at))}
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

      {explain && explain.excluded && explain.excluded.length > 0 ? (
        <Card title="Not assignable at this amount (from pool)" tone="amber">
          <p className="mb-3 text-xs text-text-muted">
            Pool requisites that fail gates or are strictly after the ordered queue. Real assignment also
            respects Redis locks and provider routing.
          </p>
          <div className="max-h-[320px] overflow-auto rounded-lg border border-border-primary">
            <table className="w-full min-w-[640px] text-left text-xs">
              <thead className="sticky top-0 bg-surface-secondary">
                <tr className="border-b border-border-primary text-text-muted">
                  <th className="px-2 py-2">Reason</th>
                  <th className="px-2 py-2">Trader</th>
                  <th className="px-2 py-2">Requisite</th>
                  <th className="px-2 py-2">Method</th>
                  <th className="px-2 py-2">Detail</th>
                </tr>
              </thead>
              <tbody>
                {explain.excluded.map((row) => (
                  <tr key={row.requisite_id} className="border-b border-border-primary/40">
                    <td className="px-2 py-1.5 align-top">
                      <Badge variant="warning">{excludedReasonLabel(row.code)}</Badge>
                      <div className="mt-0.5 font-mono text-[10px] text-text-muted">{row.code}</div>
                    </td>
                    <td className="px-2 py-1.5 align-top text-text-primary">
                      {row.trader_label || row.trader_id}
                    </td>
                    <td className="px-2 py-1.5 align-top">
                      <button
                        type="button"
                        className="font-mono text-accent-blue hover:underline"
                        onClick={() => setDetailRequisiteId(row.requisite_id)}
                      >
                        {row.requisite_masked}
                      </button>
                    </td>
                    <td className="px-2 py-1.5 align-top font-mono text-text-secondary">
                      {row.processing_method}
                    </td>
                    <td className="px-2 py-1.5 align-top text-text-secondary">{row.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

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
            {requisiteDetailQ.data.cardHolderName?.trim() ? (
              <div>
                <p className="text-xs text-text-muted">Card holder name</p>
                <p>{requisiteDetailQ.data.cardHolderName}</p>
              </div>
            ) : null}
            {requisiteDetailQ.data.bank?.name ? (
              <div>
                <p className="text-xs text-text-muted">Bank</p>
                <p>{requisiteDetailQ.data.bank.name}</p>
              </div>
            ) : null}
            <div className="grid grid-cols-2 gap-2 font-mono text-xs text-text-secondary">
              <span>
                Used / limit: {requisiteDetailQ.data.usedAmount} / {requisiteDetailQ.data.limitTotalAmount}
              </span>
              <span>
                Ops: {requisiteDetailQ.data.usedOps} / {requisiteDetailQ.data.limitTotalOps}
              </span>
            </div>
          </div>
        ) : (
          <p className="text-sm text-red-400">Could not load requisite.</p>
        )}
      </Modal>
    </div>
  );
}
