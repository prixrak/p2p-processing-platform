'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  DEFAULT_INPUT_DEBOUNCE_MS,
  useDebouncedTextFilter,
  useDebouncedValue,
} from '@/lib/hooks/use-debounced-value';
import { Download, Eye, Info } from 'lucide-react';
import { api } from '@/lib/api';
import { internalPaths } from '@/lib/internal-api';
import { SettlementCreateModal } from '@/features/settlements/settlement-create-modal';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import { Tabs } from '@/components/ui/tabs';
import { DataTable } from '@/components/ui/data-table';
import { OrderIdCopyCell } from '@/components/ui/order-id-copy-cell';
import { FilterBar, FilterInput } from '@/components/ui/filters';
import { Select } from '@/components/ui/select';
import { format } from 'date-fns';
import {
  settlementKeys,
  staffMerchantsOptionsKey,
  staffTraderKeys,
} from '@/lib/query-keys';
import { currencyCodeFromUnknown } from '@/lib/currency-code';
import { settlementRecordedByLabel } from '@/features/settlements/settlement-row-labels';
import { formatDateTime } from '@/lib/utils';

interface Settlement {
  id: string;
  type: 'CREDIT' | 'DEBIT';
  amount: number | string;
  currency: string;
  note: string | null;
  createdAt: string;
  manualRate?: number | string | null;
  usdtEquivalent?: number | string | null;
  admin: { email: string } | null;
  trader: { user: { email: string } } | null;
  payoutTrader: { user: { email: string } } | null;
  merchant: { name: string } | null;
  walletDeposit?: { txHash: string; network: string; status: string } | null;
}

interface SettlementsResponse {
  data: Settlement[];
  total: number;
  page: number;
  limit: number;
}

interface SettlementDetail extends Settlement {}

function participantLabel(s: Settlement): string {
  if (s.merchant?.name) return `Merchant: ${s.merchant.name}`;
  if (s.payoutTrader?.user?.email) return `Pay-Out specialist: ${s.payoutTrader.user.email}`;
  if (s.trader?.user?.email) return `Trader: ${s.trader.user.email}`;
  return '—';
}

const typeColor: Record<string, 'green' | 'red'> = {
  CREDIT: 'green',
  DEBIT: 'red',
};

export default function SettlementsPage() {
  const [tab, setTab] = useState('ALL');
  const [page, setPage] = useState(1);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [participantRole, setParticipantRole] = useState<
    'any' | 'trader' | 'payout' | 'merchant'
  >('any');
  const [participantId, setParticipantId] = useState('');
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
  const pageSize = 20;

  useEffect(() => {
    setPage(1);
  }, [
    tab,
    participantRole,
    participantId,
    debouncedCurrency,
    dateFrom,
    dateTo,
    debouncedMinAmount,
    debouncedMaxAmount,
  ]);

  const { data: traders = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: staffTraderKeys.traderOptions('owner'),
    queryFn: async () => {
      const res = await api.get<{
        data: Array<{ id: string; user: { email: string } }>;
      }>(`${internalPaths.traders}?page=1&limit=500`);
      return res.data.map((t) => ({ id: t.id, name: t.user.email }));
    },
  });

  const { data: merchants = [] } = useQuery<Array<{ id: string; name: string }>>({
    queryKey: staffMerchantsOptionsKey('owner'),
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

  const { data, isLoading } = useQuery({
    queryKey: settlementKeys.owner.list(
      tab,
      page,
      participantRole,
      participantId,
      debouncedCurrency,
      dateFrom,
      dateTo,
      debouncedMinAmount,
      debouncedMaxAmount,
    ),
    queryFn: () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(pageSize),
      });
      if (tab !== 'ALL') params.set('type', tab);
      if (participantRole === 'trader' && participantId.trim()) params.set('traderId', participantId.trim());
      if (participantRole === 'payout' && participantId.trim()) {
        params.set('payoutTraderId', participantId.trim());
      }
      if (participantRole === 'merchant' && participantId.trim()) {
        params.set('merchantId', participantId.trim());
      }
      if (debouncedCurrency) params.set('currency', debouncedCurrency);
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);
      if (debouncedMinAmount) params.set('minAmount', debouncedMinAmount);
      if (debouncedMaxAmount) params.set('maxAmount', debouncedMaxAmount);

      return api.get<SettlementsResponse>(`${internalPaths.settlements}?${params}`);
    },
  });

  const { data: details } = useQuery({
    queryKey: settlementKeys.owner.detail(detailId),
    queryFn: () => api.get<SettlementDetail>(internalPaths.settlementDetail(detailId!)),
    enabled: !!detailId,
  });

  const totalPages = data
    ? Math.max(1, Math.ceil(data.total / (data.limit || pageSize)))
    : 1;

  const rows = data?.data ?? [];

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
      'recorded_by',
      'created_at',
    ];
    const lines = [
      header.join(','),
      ...rows.map((row) =>
        [
          row.id,
          `"${participantLabel(row).replace(/"/g, '""')}"`,
          row.type,
          row.walletDeposit ? 'yes' : '',
          typeof row.amount === 'string' ? row.amount : String(row.amount),
          currencyCodeFromUnknown(row.currency),
          row.manualRate != null ? String(row.manualRate) : '',
          row.usdtEquivalent != null ? String(row.usdtEquivalent) : '',
          `"${settlementRecordedByLabel(row).replace(/"/g, '""')}"`,
          row.createdAt,
        ].join(','),
      ),
    ];
    return new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  }, [rows]);

  function downloadCsv() {
    const url = URL.createObjectURL(csvBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `settlements-${format(new Date(), 'yyyy-MM-dd-HHmm')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function resetParticipant() {
    setParticipantId('');
    setPage(1);
  }

  const participantRoleSelect = (
    <Select
      label="Participant"
      options={[
        { value: 'any', label: 'Any' },
        { value: 'trader', label: 'Standard trader' },
        { value: 'payout', label: 'Pay-Out specialist' },
        { value: 'merchant', label: 'Merchant' },
      ]}
      value={participantRole}
      onChange={(e) => {
        setParticipantRole(e.target.value as typeof participantRole);
        resetParticipant();
      }}
    />
  );

  const participantPick =
    participantRole === 'any' ? null : participantRole === 'trader' ? (
      <Select
        label="Trader"
        options={[{ value: '', label: '—' }, ...traders.map((t) => ({ value: t.id, label: t.name }))]}
        value={participantId}
        onChange={(e) => {
          setParticipantId(e.target.value);
          setPage(1);
        }}
      />
    ) : participantRole === 'payout' ? (
      <Select
        label="Specialist"
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
      key: 'id',
      header: 'Settlement ID',
      className: 'font-mono tabular-nums text-end',
      render: (s: Settlement) => <OrderIdCopyCell id={s.id} label="Settlement ID" />,
    },
    {
      key: 'type',
      header: 'Type',
      className: 'text-center',
      render: (s: Settlement) => (
        <Badge color={typeColor[s.type] ?? 'default'}>{s.type}</Badge>
      ),
    },
    {
      key: 'topUp',
      header: 'Top-up',
      className: 'text-center',
      render: (s: Settlement) =>
        s.walletDeposit ? (
          <Badge color="green">On-chain</Badge>
        ) : (
          <span className="text-sm text-text-muted">—</span>
        ),
    },
    {
      key: 'participant',
      header: 'Participant',
      render: (s: Settlement) => (
        <span className="text-sm text-text-secondary">{participantLabel(s)}</span>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      className: 'text-end tabular-nums',
      render: (s: Settlement) => (
        <span className="font-mono text-sm font-medium text-text-primary">
          {Number(s.amount).toLocaleString()} {currencyCodeFromUnknown(s.currency)}
        </span>
      ),
    },
    {
      key: 'admin',
      header: 'Recorded by',
      render: (s: Settlement) => (
        <span className="text-sm text-text-muted">{settlementRecordedByLabel(s)}</span>
      ),
    },
    {
      key: 'date',
      header: 'Created',
      render: (s: Settlement) => (
        <span className="text-sm text-text-muted">{formatDateTime(new Date(s.createdAt))}</span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      className: 'text-end',
      render: (s: Settlement) => (
        <IconButton label="View settlement details" onClick={() => setDetailId(s.id)}>
          <Eye className="h-4 w-4" />
        </IconButton>
      ),
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Settlements</h1>
          <p className="mt-1 text-sm text-text-muted">
            Credit/debit bookings for traders, pay-out specialists, and merchants — filter and export below.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            className="inline-flex items-center gap-2"
            disabled={rows.length === 0}
            onClick={downloadCsv}
          >
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
          <Button onClick={() => setShowForm(true)}>New Settlement</Button>
        </div>
      </div>

      <div className="rounded-lg border border-border-subtle bg-bg-secondary/60 px-4 py-3 flex gap-3 text-sm text-text-secondary">
        <Info className="h-5 w-5 shrink-0 text-accent-blue mt-0.5" />
        <div>
          <p className="font-medium text-text-primary">Corrections</p>
          <p className="mt-1 text-xs leading-relaxed">
            Incorrect rows stay in the ledger — post offsetting MANUAL CREDIT/DEBIT via{' '}
            <code className="text-xs bg-bg-primary px-1 rounded">{internalPaths.adminBalanceAdjust}</code>
            {' '}after picking a trader in{' '}
            <Link href="/owner/users" className="underline text-accent-blue">
              Users
            </Link>
            .
          </p>
        </div>
      </div>

      <div className="md:max-w-sm">{participantRoleSelect}</div>
      {participantPick ? <div className="max-w-md">{participantPick}</div> : null}

      <Tabs
        tabs={[
          { key: 'ALL', label: 'All' },
          { key: 'CREDIT', label: 'Credits' },
          { key: 'DEBIT', label: 'Debits' },
        ]}
        active={tab}
        onChange={(k) => {
          setTab(k);
          setPage(1);
        }}
      />

      <FilterBar>
        <FilterInput
          label="Currency"
          value={currency}
          onChange={(v) => setCurrency(v.toUpperCase())}
          placeholder="UAH"
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
          className="w-28"
        />
        <FilterInput
          label="Max amount"
          value={maxAmount}
          onChange={setMaxAmount}
          className="w-28"
        />
      </FilterBar>

      <DataTable
        columns={columns}
        data={rows}
        isLoading={isLoading}
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        emptyMessage="No settlements match filters"
      />

      <SettlementCreateModal
        open={showForm}
        onClose={() => setShowForm(false)}
        queryPrefix="owner"
      />

      <Modal
        open={!!detailId}
        onClose={() => setDetailId(null)}
        title={`Settlement — ${detailId?.slice(0, 12) ?? ''}`}
      >
        {details && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-text-muted">Type</p>
                <Badge color={typeColor[details.type] ?? 'default'}>{details.type}</Badge>
              </div>
              <div>
                <p className="text-xs text-text-muted">Amount</p>
                <p className="font-mono font-medium text-text-primary">
                  {Number(details.amount).toLocaleString()}{' '}
                  {currencyCodeFromUnknown(details.currency)}
                </p>
              </div>
              <div>
                <p className="text-xs text-text-muted">Participant</p>
                <p className="text-sm text-text-primary">{participantLabel(details)}</p>
              </div>
              <div>
                <p className="text-xs text-text-muted">Recorded by</p>
                <p className="text-sm text-text-secondary">{settlementRecordedByLabel(details)}</p>
              </div>
              {details.walletDeposit ? (
                <div className="col-span-2 rounded-lg border border-border-subtle bg-bg-primary/40 p-3">
                  <p className="text-xs text-text-muted mb-1">On-chain deposit</p>
                  <p className="text-sm font-mono text-text-primary break-all">
                    {details.walletDeposit.network} · {details.walletDeposit.txHash}
                  </p>
                  <p className="text-xs text-text-muted mt-1">
                    Deposit status: {details.walletDeposit.status}
                  </p>
                </div>
              ) : null}
              <div className="col-span-2">
                <p className="text-xs text-text-muted">Created At</p>
                <p className="text-sm text-text-secondary">
                  {formatDateTime(new Date(details.createdAt))}
                </p>
              </div>
              {(details.manualRate != null || details.usdtEquivalent != null) && (
                <>
                  <div>
                    <p className="text-xs text-text-muted">Manual FX</p>
                    <p className="text-sm font-mono">{Number(details.manualRate ?? 0).toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-xs text-text-muted">USDT out</p>
                    <p className="text-sm font-mono">
                      {details.usdtEquivalent != null
                        ? `${Number(details.usdtEquivalent).toLocaleString()} USDT`
                        : '—'}
                    </p>
                  </div>
                </>
              )}
            </div>

            {details.note && (
              <div className="rounded-lg border border-border-primary bg-surface-primary p-3">
                <p className="mb-1 text-xs text-text-muted">Note</p>
                <p className="text-sm text-text-secondary">{details.note}</p>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
