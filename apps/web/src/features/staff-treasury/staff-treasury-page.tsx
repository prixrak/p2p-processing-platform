'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CircleDollarSign, Save } from 'lucide-react';
import { api } from '@/lib/api';
import { internalPaths } from '@/lib/internal-api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { parseDecimalInput } from '@/lib/decimal-input';
import { treasuryKeys, type StaffRolePrefix } from '@/lib/query-keys';

type ExchangeStatus = {
  primaryPairParserFiatPerUsdt: number | null;
  cacheUpdatedAt: string | null;
  lastSuccessAt: string | null;
  stale: boolean;
  staleThresholdMinutes: number;
  rawSample: unknown;
  cacheRawSample?: unknown;
};

type IncomeSummary = {
  totalIncomeUsdt: number;
  totalIncomeLocal: number;
  rowCount: number;
  byOrderType: Array<{
    order_type: string;
    income_usdt: number;
    income_local: number;
    count: number;
  }>;
  topMerchants?: Array<{
    merchant_id: string;
    merchant_name: string;
    income_usdt: number;
    income_local: number;
    count: number;
  }>;
};

type OperationsSummary = {
  payin_orders_created: number;
  payin_orders_paid: number;
  payout_orders_created: number;
  payout_orders_completed: number;
  conversion_payin_pct: number;
  conversion_payout_pct: number;
  conversion_overall_pct: number;
  turnover_local_from_income_ledger: number;
  sum_income_usdt_in_range: number;
  sum_income_local_booked_in_range: number;
  reference_income_local_at_current_parser: number | null;
  current_parser_fiat_per_usdt: number | null;
  trader_rate_bonus_usdt: Array<{
    trader_id: string;
    trader_email: string;
    payin_bonus_usdt: number;
    payout_bonus_usdt: number;
    total_bonus_usdt: number;
  }>;
};

function incomeOrderKindLabel(orderType: string): string {
  const u = orderType.toUpperCase();
  if (u === 'PAYIN') return 'Pay-In';
  if (u === 'PAYOUT') return 'Pay-Out';
  return orderType.replace(/_/g, ' ');
}

export interface StaffTreasuryPageProps {
  staffPrefix: StaffRolePrefix;
}

export function StaffTreasuryPage({ staffPrefix }: StaffTreasuryPageProps) {
  const queryClient = useQueryClient();
  const [wAmount, setWAmount] = useState('');
  const [wAddress, setWAddress] = useState('');
  const [wNetwork, setWNetwork] = useState<'TRC20' | 'ERC20'>('TRC20');
  const [wTx, setWTx] = useState('');
  const [wNote, setWNote] = useState('');

  const [dTrader, setDTrader] = useState('');
  const [dTx, setDTx] = useState('');
  const [dAmount, setDAmount] = useState('');
  const [dConf, setDConf] = useState('20');
  const [dNetwork, setDNetwork] = useState<'TRC20' | 'ERC20'>('TRC20');

  const [opFrom, setOpFrom] = useState('');
  const [opTo, setOpTo] = useState('');

  const opQs =
    opFrom || opTo
      ? new URLSearchParams({
          ...(opFrom ? { dateFrom: opFrom } : {}),
          ...(opTo ? { dateTo: opTo } : {}),
        }).toString()
      : '';

  const { data: xr, isLoading: xrLoading } = useQuery({
    queryKey: treasuryKeys.exchangeRate(staffPrefix),
    queryFn: () => api.get<ExchangeStatus>(internalPaths.adminPlatformExchangeRate),
  });

  const { data: summary, isLoading: sumLoading } = useQuery({
    queryKey: treasuryKeys.incomeSummary(staffPrefix),
    queryFn: () => api.get<IncomeSummary>(internalPaths.adminPlatformIncomeSummary()),
  });

  const { data: recent } = useQuery({
    queryKey: treasuryKeys.incomeRecent(staffPrefix),
    queryFn: () =>
      api.get<{ data: unknown[] }>(internalPaths.adminPlatformIncomeRecent('page=1&limit=15')),
  });

  const { data: withdrawals } = useQuery({
    queryKey: treasuryKeys.withdrawals(staffPrefix),
    queryFn: () =>
      api.get<{ data: unknown[] }>(internalPaths.adminPlatformWithdrawals('page=1&limit=20')),
  });

  const { data: deposits } = useQuery({
    queryKey: treasuryKeys.deposits(staffPrefix),
    queryFn: () =>
      api.get<{ data: unknown[] }>(internalPaths.adminPlatformWalletDeposits('page=1&limit=20')),
  });

  const { data: ops, isLoading: opsLoading } = useQuery({
    queryKey: treasuryKeys.operations(staffPrefix, opFrom, opTo),
    queryFn: () => api.get<OperationsSummary>(internalPaths.adminPlatformOperationsSummary(opQs)),
  });

  const withdrawalMut = useMutation({
    mutationFn: () =>
      api.post(internalPaths.adminPlatformWithdrawalsPost, {
        amount_usdt: parseDecimalInput(wAmount),
        cold_wallet_address: wAddress,
        network: wNetwork,
        tx_hash: wTx || undefined,
        note: wNote || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: treasuryKeys.withdrawals(staffPrefix) });
      setWAmount('');
      setWAddress('');
      setWTx('');
      setWNote('');
    },
  });

  const depositMut = useMutation({
    mutationFn: () =>
      api.post(internalPaths.adminPlatformWalletDepositConfirm, {
        trader_id: dTrader,
        tx_hash: dTx,
        network: dNetwork,
        amount_usdt: parseDecimalInput(dAmount),
        confirmations: parseInt(dConf, 10) || 0,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: treasuryKeys.deposits(staffPrefix) });
      setDTrader('');
      setDTx('');
      setDAmount('');
    },
  });

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
          <CircleDollarSign size={24} />
          Treasury
        </h1>
        <p className="text-sm text-text-muted mt-1">
          Reference rate status, platform income, cold-wallet withdrawals, and deposit credits
        </p>
      </div>

      <section className="rounded-xl border border-border-subtle bg-bg-secondary p-4 space-y-2">
        <h2 className="text-sm font-semibold text-text-primary">Reference rate (fiat per USDT)</h2>
        {xrLoading ? (
          <p className="text-sm text-text-muted">Loading…</p>
        ) : xr ? (
          <div className="text-sm space-y-1">
            <p>
              <span className="text-text-muted">Rate:</span>{' '}
              <span className="tabular-nums">{xr.primaryPairParserFiatPerUsdt ?? '—'}</span>
            </p>
            <p>
              <span className="text-text-muted">Last update:</span>{' '}
              {xr.cacheUpdatedAt ?? '—'}
            </p>
            <p>
              <span className="text-text-muted">Last successful refresh:</span>{' '}
              {xr.lastSuccessAt ?? '—'}
            </p>
            <p>
              <span className="text-text-muted">Stale after {xr.staleThresholdMinutes} min:</span>{' '}
              <span className={xr.stale ? 'text-accent-yellow' : 'text-accent-green'}>
                {xr.stale ? 'yes' : 'no'}
              </span>
            </p>
          </div>
        ) : null}
      </section>

      <section className="rounded-xl border border-border-subtle bg-bg-secondary p-4 space-y-3">
        <h2 className="text-sm font-semibold text-text-primary">Platform income (ledger)</h2>
        {sumLoading ? (
          <p className="text-sm text-text-muted">Loading…</p>
        ) : summary ? (
          <div className="text-sm grid gap-2 sm:grid-cols-3">
            <div>
              <p className="text-text-muted">Total USDT</p>
              <p className="font-mono text-text-primary">
                {summary.totalIncomeUsdt.toLocaleString(undefined, { maximumFractionDigits: 6 })}
              </p>
            </div>
            <div>
              <p className="text-text-muted">Total local fiat (booked)</p>
              <p className="font-mono text-text-primary">
                {summary.totalIncomeLocal.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </p>
            </div>
            <div>
              <p className="text-text-muted">Income lines</p>
              <p className="font-mono text-text-primary tabular-nums">{summary.rowCount}</p>
            </div>
            {summary.byOrderType.map((r) => (
              <div key={r.order_type} className="sm:col-span-3 text-xs text-text-secondary">
                {incomeOrderKindLabel(r.order_type)}: {r.income_usdt.toFixed(4)} USDT /{' '}
                {r.income_local.toFixed(2)} local fiat ({r.count} orders)
              </div>
            ))}
          </div>
        ) : null}
      </section>

      {summary?.topMerchants && summary.topMerchants.length > 0 ? (
        <section className="rounded-xl border border-border-subtle bg-bg-secondary p-4 space-y-2">
          <h2 className="text-sm font-semibold text-text-primary">Income by merchant (top)</h2>
          <div className="max-h-48 overflow-auto text-xs space-y-1">
            {summary.topMerchants.map((m) => (
              <div
                key={m.merchant_id}
                className="flex justify-between gap-2 border-b border-border-subtle/50 py-1"
              >
                <span className="truncate text-text-secondary">{m.merchant_name}</span>
                <span>{m.income_usdt.toFixed(4)} USDT</span>
                <span className="text-text-muted">{m.count} orders</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="rounded-xl border border-border-subtle bg-bg-secondary p-4 space-y-3">
        <h2 className="text-sm font-semibold text-text-primary">Operations and conversion</h2>
        <div className="flex flex-wrap gap-2 items-end">
          <div>
            <label className="text-xs text-text-muted block mb-1">From</label>
            <input
              type="date"
              className="rounded-lg border border-border-subtle bg-bg-primary px-3 py-2 text-sm"
              value={opFrom}
              onChange={(e) => setOpFrom(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-text-muted block mb-1">To</label>
            <input
              type="date"
              className="rounded-lg border border-border-subtle bg-bg-primary px-3 py-2 text-sm"
              value={opTo}
              onChange={(e) => setOpTo(e.target.value)}
            />
          </div>
        </div>
        {opsLoading || !ops ? (
          <p className="text-sm text-text-muted">Loading…</p>
        ) : (
          <div className="text-xs space-y-2">
            <p className="tabular-nums">
              Pay-In: {ops.payin_orders_paid} paid / {ops.payin_orders_created} created (
              {ops.conversion_payin_pct.toFixed(1)}%)
            </p>
            <p className="tabular-nums">
              Pay-Out: {ops.payout_orders_completed} completed / {ops.payout_orders_created} created (
              {ops.conversion_payout_pct.toFixed(1)}%)
            </p>
            <p className="tabular-nums">Overall funnel: {ops.conversion_overall_pct.toFixed(1)}%</p>
            <p className="tabular-nums">
              Turnover (local fiat, booked): {ops.turnover_local_from_income_ledger.toFixed(2)}
            </p>
            <p className="tabular-nums">Income USDT (range): {ops.sum_income_usdt_in_range.toFixed(6)}</p>
            <p className="tabular-nums">
              Income local fiat booked (range): {ops.sum_income_local_booked_in_range.toFixed(2)}
            </p>
            <p className="tabular-nums">
              {ops.reference_income_local_at_current_parser != null &&
              ops.current_parser_fiat_per_usdt != null ? (
                <>
                  Estimated local fiat at current rate:{' '}
                  {ops.reference_income_local_at_current_parser.toFixed(2)} (
                  {ops.current_parser_fiat_per_usdt.toFixed(4)} local per USDT)
                </>
              ) : (
                'Estimated local fiat at current rate: —'
              )}
            </p>
            <div className="pt-2">
              <p className="text-text-muted mb-1">Trader rate bonus (USDT est.)</p>
              <div className="max-h-40 overflow-auto space-y-0.5">
                {ops.trader_rate_bonus_usdt.length === 0 ? (
                  <span className="text-text-muted">No data in range</span>
                ) : (
                  ops.trader_rate_bonus_usdt.map((t) => (
                    <div
                      key={t.trader_id}
                      className="flex justify-between gap-2 border-b border-border-subtle/40 py-0.5"
                    >
                      <span className="truncate text-text-secondary">{t.trader_email}</span>
                      <span>{t.total_bonus_usdt.toFixed(4)}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-border-subtle bg-bg-secondary p-4">
        <h2 className="text-sm font-semibold text-text-primary mb-3">Recent income</h2>
        <div className="max-h-56 overflow-auto text-xs space-y-1">
          {(recent?.data as Array<{ id: string; incomeUsdt: unknown; orderType: string }>)?.map(
            (r) => (
              <div
                key={r.id}
                className="flex justify-between gap-2 border-b border-border-subtle/50 py-1 tabular-nums"
              >
                <span className="text-text-muted truncate" title={r.id}>
                  …{r.id.slice(0, 8)}
                </span>
                <span>{incomeOrderKindLabel(r.orderType)}</span>
                <span>{String(r.incomeUsdt)}</span>
              </div>
            ),
          ) ?? <p className="text-text-muted">No data</p>}
        </div>
      </section>

      <section className="rounded-xl border border-border-subtle bg-bg-secondary p-4 space-y-3">
        <h2 className="text-sm font-semibold text-text-primary">Record cold-wallet withdrawal</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label="Amount USDT"
            value={wAmount}
            onChange={(e) => setWAmount(e.target.value)}
            placeholder="0"
            inputMode="decimal"
          />
          <Input
            label="Cold wallet address"
            value={wAddress}
            onChange={(e) => setWAddress(e.target.value)}
          />
          <div>
            <label className="text-xs text-text-muted block mb-1">Network</label>
            <select
              className="w-full rounded-lg border border-border-subtle bg-bg-primary px-3 py-2 text-sm"
              value={wNetwork}
              onChange={(e) => setWNetwork(e.target.value as 'TRC20' | 'ERC20')}
            >
              <option value="TRC20">TRC20</option>
              <option value="ERC20">ERC20</option>
            </select>
          </div>
          <Input label="Tx hash (optional)" value={wTx} onChange={(e) => setWTx(e.target.value)} />
          <div className="sm:col-span-2">
            <Input label="Note (optional)" value={wNote} onChange={(e) => setWNote(e.target.value)} />
          </div>
        </div>
        <Button
          onClick={() => withdrawalMut.mutate()}
          disabled={withdrawalMut.isPending || !wAmount || !wAddress}
        >
          <Save size={16} className="mr-2 inline" />
          Save withdrawal
        </Button>
      </section>

      <section className="rounded-xl border border-border-subtle bg-bg-secondary p-4 space-y-3">
        <h2 className="text-sm font-semibold text-text-primary">Manual deposit credit</h2>
        <p className="text-xs text-text-muted">
          Automated TRC-20 crediting runs when the trader has a deposit address. Use this form for ERC-20
          or manual overrides.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label="Trader ID"
            value={dTrader}
            onChange={(e) => setDTrader(e.target.value)}
          />
          <Input label="Tx hash" value={dTx} onChange={(e) => setDTx(e.target.value)} />
          <Input label="Amount USDT" value={dAmount} onChange={(e) => setDAmount(e.target.value)} inputMode="decimal" />
          <Input label="Confirmations" value={dConf} onChange={(e) => setDConf(e.target.value)} />
          <div>
            <label className="text-xs text-text-muted block mb-1">Network</label>
            <select
              className="w-full rounded-lg border border-border-subtle bg-bg-primary px-3 py-2 text-sm"
              value={dNetwork}
              onChange={(e) => setDNetwork(e.target.value as 'TRC20' | 'ERC20')}
            >
              <option value="TRC20">TRC20</option>
              <option value="ERC20">ERC20</option>
            </select>
          </div>
        </div>
        <Button
          onClick={() => depositMut.mutate()}
          disabled={depositMut.isPending || !dTrader || !dTx || !dAmount}
        >
          Credit deposit
        </Button>
      </section>

      <section className="rounded-xl border border-border-subtle bg-bg-secondary p-4">
        <h2 className="text-sm font-semibold text-text-primary mb-3">Recent withdrawals</h2>
        <div className="max-h-48 overflow-auto text-xs space-y-1">
          {(
            withdrawals?.data as Array<{
              id: string;
              amountUsdt: unknown;
              coldWalletAddress: string;
              createdAt: string;
            }>
          )?.map((r) => (
            <div key={r.id} className="flex justify-between gap-2 border-b border-border-subtle/50 py-1">
              <span>{String(r.amountUsdt)} USDT</span>
              <span className="truncate text-text-muted">{r.coldWalletAddress}</span>
              <span className="text-text-muted">{r.createdAt?.slice(0, 10)}</span>
            </div>
          )) ?? <p className="text-text-muted">No data</p>}
        </div>
      </section>

      <section className="rounded-xl border border-border-subtle bg-bg-secondary p-4">
        <h2 className="text-sm font-semibold text-text-primary mb-3">Wallet deposits</h2>
        <div className="max-h-48 overflow-auto text-xs space-y-1">
          {(
            deposits?.data as Array<{
              id: string;
              txHash: string;
              amountUsdt: unknown;
              status: string;
            }>
          )?.map((r) => (
            <div key={r.id} className="flex justify-between gap-2 border-b border-border-subtle/50 py-1">
              <span className="truncate">{r.txHash.slice(0, 12)}…</span>
              <span>{String(r.amountUsdt)}</span>
              <span>{r.status}</span>
            </div>
          )) ?? <p className="text-text-muted">No data</p>}
        </div>
      </section>
    </div>
  );
}
