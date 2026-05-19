'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  DEFAULT_INPUT_DEBOUNCE_MS,
  useDebouncedTextFilter,
  useDebouncedValue,
} from '@/lib/hooks/use-debounced-value';
import { Download, Info, Landmark } from 'lucide-react';
import { api } from '@/lib/api';
import { internalPaths } from '@/lib/internal-api';
import { SettlementCreateModal } from '@/features/settlements/settlement-create-modal';
import { DataTable } from '@/components/ui/data-table';
import { PaginationControls } from '@/components/ui/pagination-controls';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FiltersToggleButton, ListPageHeader } from '@/components/ui/list-page-tools';
import { FilterBar, FilterInput } from '@/components/ui/filters';
import { Select } from '@/components/ui/select';
import { format } from 'date-fns';
import {
  settlementKeys,
  staffMerchantsOptionsKey,
  staffTraderKeys,
} from '@/lib/query-keys';
import { currencyCodeFromUnknown } from '@/lib/currency-code';
import { Badge } from '@/components/ui/badge';
import { settlementRecordedByLabel } from '@/features/settlements/settlement-row-labels';
import { formatDateTime } from '@/lib/utils';

interface SettlementRow {
  id: string;
  type: string;
  amount: number | string;
  currency: string;
  note: string | null;
  createdAt: string;
  manualRate?: number | string | null;
  usdtEquivalent?: number | string | null;
  admin: { email: string } | null;
  trader: { user: { email: string } } | null;
  payoutTrader: { user: { email: string } } | null;
  merchant: { id: string; name: string } | null;
  walletDeposit?: { txHash: string; network: string; status: string } | null;
}

function num(v: number | string | null | undefined) {
  if (v === null || v === undefined) return '';
  return typeof v === 'string' ? v : String(v);
}

function participantLabel(row: SettlementRow): string {
  if (row.merchant?.name) return `Merchant: ${row.merchant.name}`;
  if (row.payoutTrader?.user?.email) return `Pay-Out specialist: ${row.payoutTrader.user.email}`;
  if (row.trader?.user?.email) return `Trader: ${row.trader.user.email}`;
  return '—';
}

export default function SettlementsPage() {
  const [showForm, setShowForm] = useState(false);
  const [showFilters, setShowFilters] = useState(true);
  const [page, setPage] = useState(1);
  const [participantRole, setParticipantRole] = useState<
    'any' | 'trader' | 'payout' | 'merchant'
  >('any');
  const [participantId, setParticipantId] = useState('');
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'CREDIT' | 'DEBIT'>('ALL');
  const [currency, setCurrency] = useState('');
  const debouncedCurrency = useDebouncedValue(
    currency,
    DEFAULT_INPUT_DEBOUNCE_MS,
    (v) => v.trim().toUpperCase(),
  );
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const {
    value: minAmount,
    setValue: setMinAmount,
    debounced: debouncedMinAmount,
  } = useDebouncedTextFilter();
  const {
    value: maxAmount,
    setValue: setMaxAmount,
    debounced: debouncedMaxAmount,
  } = useDebouncedTextFilter();
  const pageSize = 50;

  useEffect(() => {
    setPage(1);
  }, [
    participantRole,
    participantId,
    typeFilter,
    debouncedCurrency,
    dateFrom,
    dateTo,
    debouncedMinAmount,
    debouncedMaxAmount,
  ]);

  const { data: traders = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: staffTraderKeys.traderOptions('admin'),
    queryFn: async () => {
      const res = await api.get<{
        data: Array<{ id: string; user: { email: string } }>;
      }>(`${internalPaths.traders}?page=1&limit=500`);
      return res.data.map((t) => ({ id: t.id, name: t.user.email }));
    },
  });

  const { data: merchants = [] } = useQuery<Array<{ id: string; name: string }>>({
    queryKey: staffMerchantsOptionsKey('admin'),
    queryFn: async () => {
      const res = await api.get<{ data: Array<{ id: string; name: string }> }>(
        `${internalPaths.merchants}?page=1&limit=300`,
      );
      return res.data;
    },
  });

  const { data: payoutOpts } = useQuery<{ data: Array<{ id: string; email: string }> }>({
    queryKey: settlementKeys.payoutSpecialistOptions,
    queryFn: () => api.get(internalPaths.settlementsPayoutSpecialistOptions),
  });
  const payoutSpecialists = payoutOpts?.data ?? [];

  const queryKey = settlementKeys.admin.list(
    page,
    participantRole,
    participantId,
    typeFilter,
    debouncedCurrency,
    dateFrom,
    dateTo,
    debouncedMinAmount,
    debouncedMaxAmount,
  );

  const query = useQuery({
    queryKey,
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(pageSize),
      });
      if (participantRole === 'trader' && participantId.trim()) params.set('traderId', participantId.trim());
      if (participantRole === 'payout' && participantId.trim()) {
        params.set('payoutTraderId', participantId.trim());
      }
      if (participantRole === 'merchant' && participantId.trim()) {
        params.set('merchantId', participantId.trim());
      }
      if (typeFilter !== 'ALL') params.set('type', typeFilter);
      if (debouncedCurrency) params.set('currency', debouncedCurrency);
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);
      if (debouncedMinAmount) params.set('minAmount', debouncedMinAmount);
      if (debouncedMaxAmount) params.set('maxAmount', debouncedMaxAmount);

      const res = await api.get<{ data: SettlementRow[]; total: number; page: number; limit: number }>(
        `${internalPaths.settlements}?${params}`,
      );
      return res;
    },
  });

  const settlements = query.data?.data ?? [];
  const total = query.data?.total ?? 0;
  const isLoading = query.isLoading;

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const csvBlob = useMemo(() => {
    const header = [
      'id',
      'participant',
      'type',
      'on_chain_top_up',
      'amount',
      'currency',
      'manual_rate',
      'usdt_equivalent',
      'note',
      'recorded_by',
      'created_at',
    ];
    const lines = [
      header.join(','),
      ...settlements.map((row) =>
        [
          row.id,
          `"${participantLabel(row).replace(/"/g, '""')}"`,
          row.type,
          row.walletDeposit ? 'yes' : '',
          num(row.amount),
          currencyCodeFromUnknown(row.currency),
          num(row.manualRate ?? undefined),
          num(row.usdtEquivalent ?? undefined),
          `"${(row.note ?? '').replace(/"/g, '""')}"`,
          `"${settlementRecordedByLabel(row).replace(/"/g, '""')}"`,
          row.createdAt,
        ].join(','),
      ),
    ];
    return new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  }, [settlements]);

  function downloadCsv() {
    const url = URL.createObjectURL(csvBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `settlements-${format(new Date(), 'yyyy-MM-dd-HHmm')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function resetParticipantId() {
    setParticipantId('');
    setPage(1);
  }

  const participantSelect = (
    <Select
      label="Participant"
      placeholder="Choose role first"
      options={[
        { value: 'any', label: 'Any' },
        { value: 'trader', label: 'Standard trader' },
        { value: 'payout', label: 'Pay-Out specialist' },
        { value: 'merchant', label: 'Merchant' },
      ]}
      value={participantRole}
      onChange={(e) => {
        setParticipantRole(e.target.value as typeof participantRole);
        resetParticipantId();
      }}
    />
  );

  const participantPick =
    participantRole === 'any' ? null : participantRole === 'trader' ? (
      <Select
        label="Trader email"
        options={[{ value: '', label: '—' }, ...traders.map((t) => ({ value: t.id, label: t.name }))]}
        value={participantId}
        onChange={(e) => {
          setParticipantId(e.target.value);
          setPage(1);
        }}
      />
    ) : participantRole === 'payout' ? (
      <Select
        label="Specialist email"
        options={[
          { value: '', label: '—' },
          ...payoutSpecialists.map((p) => ({ value: p.id, label: p.email })),
        ]}
        value={participantId}
        onChange={(e) => {
          setParticipantId(e.target.value);
          setPage(1);
        }}
      />
    ) : (
      <Select
        label="Merchant"
        options={[{ value: '', label: '—' }, ...merchants.map((m) => ({ value: m.id, label: m.name }))]}
        value={participantId}
        onChange={(e) => {
          setParticipantId(e.target.value);
          setPage(1);
        }}
      />
    );

  const columns = [
    {
      key: 'participant',
      header: 'Participant',
      render: (row: SettlementRow) => (
        <span className="text-sm text-text-primary">{participantLabel(row)}</span>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      className: 'text-center',
      render: (row: SettlementRow) => (
        <span className={row.type === 'CREDIT' ? 'text-accent-green' : 'text-accent-red'}>{row.type}</span>
      ),
    },
    {
      key: 'topUp',
      header: 'Top-up',
      className: 'text-center',
      render: (row: SettlementRow) =>
        row.walletDeposit ? (
          <Badge color="green">On-chain</Badge>
        ) : (
          <span className="text-text-muted text-sm">—</span>
        ),
    },
    {
      key: 'amount',
      header: 'Amount',
      className: 'text-end tabular-nums font-mono text-sm',
      render: (row: SettlementRow) => (
        <span className="font-mono text-text-primary">
          {row.type === 'CREDIT' ? '+' : '−'}
          {Number(row.amount).toLocaleString()} {currencyCodeFromUnknown(row.currency)}
        </span>
      ),
    },
    {
      key: 'fx',
      header: 'FX / USDT',
      className: 'text-xs font-mono',
      render: (row: SettlementRow) => (
        <span className="text-text-muted">
          {row.manualRate != null ? (
            <>
              rate {Number(row.manualRate).toLocaleString()}
              <br />
            </>
          ) : null}
          {row.usdtEquivalent != null ? `${Number(row.usdtEquivalent).toLocaleString()} USDT` : '—'}
        </span>
      ),
    },
    {
      key: 'note',
      header: 'Note',
      render: (row: SettlementRow) => (
        <span className="text-text-muted text-xs max-w-[200px] truncate block">{row.note || '—'}</span>
      ),
    },
    {
      key: 'admin',
      header: 'Recorded by',
      render: (row: SettlementRow) => (
        <span className="text-xs text-text-muted">{settlementRecordedByLabel(row)}</span>
      ),
    },
    {
      key: 'createdAt',
      header: 'Date',
      render: (row: SettlementRow) => (
        <span className="text-xs text-text-muted">{formatDateTime(new Date(row.createdAt))}</span>
      ),
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <ListPageHeader
        title={
          <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
            <Landmark size={24} />
            Settlements
          </h1>
        }
        description="Standard trader top-ups (USDT ledger TOP_UP), Pay-Out specialist payouts, and merchant withdrawals"
        actions={
          <>
            <Button
              variant="secondary"
              onClick={downloadCsv}
              disabled={settlements.length === 0}
              className="inline-flex items-center gap-2"
            >
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
            <FiltersToggleButton
              expanded={showFilters}
              onToggle={() => setShowFilters((v) => !v)}
            />
            <Button onClick={() => setShowForm(true)}>New settlement</Button>
          </>
        }
      />

      <div className="rounded-lg border border-border-subtle bg-bg-secondary/60 px-4 py-3 flex gap-3 text-sm text-text-secondary">
        <Info className="h-5 w-5 shrink-0 text-accent-blue mt-0.5" />
        <div>
          <p className="font-medium text-text-primary">Corrections and reversals</p>
          <p className="mt-1 text-xs leading-relaxed">
            Ledger rows are append-only. Incorrect settlements are reversed via separate manual CREDIT /
            DEBIT balance lines (audit comment required). Pick a trader under{' '}
            <Link
              className="underline text-accent-blue hover:text-accent-blue/90"
              href="/admin/users"
            >
              Users
            </Link>
            , filter role <strong>Trader</strong> and search if needed, then use&nbsp;
            <code className="text-xs bg-bg-primary px-1 rounded">{internalPaths.adminBalanceAdjust}</code>{' '}
            from API clients or internal tooling.
          </p>
        </div>
      </div>

      {showFilters && (
        <Card className="space-y-4 p-4">
          <FilterBar>
            <div className="w-full md:max-w-xs">{participantSelect}</div>
          </FilterBar>
          {participantPick ? <div className="max-w-md">{participantPick}</div> : null}
          <FilterBar>
            <Select
              label="Direction"
              options={[
                { value: 'ALL', label: 'All' },
                { value: 'CREDIT', label: 'CREDIT' },
                { value: 'DEBIT', label: 'DEBIT' },
              ]}
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}
            />
            <FilterInput
              label="Currency"
              value={currency}
              onChange={(v) => setCurrency(v.toUpperCase())}
              placeholder="USDT"
              className="w-28"
            />
            <FilterInput
              type="date"
              label="From"
              value={dateFrom}
              onChange={setDateFrom}
              className="w-40"
            />
            <FilterInput
              type="date"
              label="To"
              value={dateTo}
              onChange={setDateTo}
              className="w-40"
            />
            <FilterInput
              label="Min amount"
              value={minAmount}
              onChange={setMinAmount}
              placeholder="0"
              className="w-28"
            />
            <FilterInput
              label="Max amount"
              value={maxAmount}
              onChange={setMaxAmount}
              placeholder="∞"
              className="w-28"
            />
          </FilterBar>
        </Card>
      )}

      <DataTable
        columns={columns}
        data={settlements}
        keyExtractor={(s) => s.id}
        isLoading={isLoading}
        emptyMessage="No settlements match filters"
      />

      <PaginationControls
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        captionOverride={`Total: ${total} · page ${page} / ${totalPages}`}
      />

      <SettlementCreateModal
        open={showForm}
        onClose={() => setShowForm(false)}
        queryPrefix="admin"
      />
    </div>
  );
}
