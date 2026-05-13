'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Power, PowerOff } from 'lucide-react';
import { api } from '@/lib/api';
import { internalPaths } from '@/lib/internal-api';
import { Modal } from '@/components/ui/modal';
import { StatusBadge } from '@/components/ui/badge';
import { IconButton } from '@/components/ui/icon-button';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { NumberInput } from '@/components/ui/number-input';
import { Select } from '@/components/ui/select';
import type { StaffRolePrefix } from '@/lib/query-keys';
import { cascadeKeys, staffKeys, staffTraderKeys } from '@/lib/query-keys';
import type { CascadeMethodPolicy } from '@/features/cascade/cascade-types';
import type { StaffTraderRow } from './staff-trader-types';
import { parseDecimalInput } from '@/lib/decimal-input';
import { currencyCodeFromUnknown } from '@/lib/currency-code';

const CASCADE_METHOD_HINT =
  'Fork / Card / Provider targets are set globally on the cascade dashboard (must sum to 100%). The multiplier below adjusts how fast this trader rises in the idle-time race within their tier.';

interface TraderDetail {
  id: string;
  email: string;
  processingMethod: 'CARD' | 'FORK';
  cascadeRatingMultiplier: number;
  payoutMinLimit: number;
  payoutMaxLimit: number;
  overdraftLimit?: number;
  payinRate?: number;
  payoutRate?: number;
  usdtTrc20DepositAddress?: string | null;
  usdtErc20DepositAddress?: string | null;
  requisites: Array<{
    id: string;
    type: string;
    number: string;
    bank: { name: string } | null;
    currency: string;
    isActive: boolean;
  }>;
  balances: Array<{ currency: string; available: number; frozen: number }>;
}

const sectionShell =
  'space-y-4 rounded-xl border border-border-primary bg-bg-card/40 p-5 shadow-sm';

function currencyDisplayCode(raw: unknown): string {
  const code = currencyCodeFromUnknown(raw);
  return code ? code.toUpperCase() : '';
}

export function TraderDetailModal({
  open,
  onClose,
  traderId,
  queryPrefix,
}: {
  open: boolean;
  onClose: () => void;
  traderId: string | null;
  queryPrefix: StaffRolePrefix;
}) {
  const queryClient = useQueryClient();
  const canEditStaff = queryPrefix === 'admin' || queryPrefix === 'owner';
  const [bmOverdraft, setBmOverdraft] = useState('');
  const [bmPayin, setBmPayin] = useState('');
  const [bmPayout, setBmPayout] = useState('');
  const [bmTron, setBmTron] = useState('');
  const [bmErc20, setBmErc20] = useState('');
  const balanceFormSeededRef = useRef(false);

  const [minPoolLimit, setMinPoolLimit] = useState('');
  const [maxPoolLimit, setMaxPoolLimit] = useState('');
  const payoutLimitsSeededRef = useRef(false);

  const [cascadeMethod, setCascadeMethod] = useState<'CARD' | 'FORK'>('CARD');
  const [cascadeMultiplier, setCascadeMultiplier] = useState('');
  const cascadeFormSeededRef = useRef(false);

  useEffect(() => {
    balanceFormSeededRef.current = false;
    payoutLimitsSeededRef.current = false;
    cascadeFormSeededRef.current = false;
  }, [traderId]);

  const { data: methodPolicy } = useQuery({
    queryKey: cascadeKeys.methodPolicy(),
    queryFn: () => api.get<CascadeMethodPolicy>(internalPaths.adminCascadeMethodPolicy),
    enabled: open && canEditStaff,
  });

  const { data: traderDetail, isLoading: detailLoading } = useQuery<TraderDetail>({
    queryKey: traderId ? staffTraderKeys.detail(queryPrefix, traderId) : ['noop'],
    queryFn: async () => {
      const raw = await api.get<{
        id: string;
        isActive: boolean;
        payoutMinLimit?: unknown;
        payoutMaxLimit?: unknown;
        user: { email: string };
        overdraftLimit?: unknown;
        payinRate?: unknown;
        payoutRate?: unknown;
        usdtTrc20DepositAddress?: string | null;
        usdtErc20DepositAddress?: string | null;
        processingMethod?: 'CARD' | 'FORK';
        cascadeRatingMultiplier?: unknown;
        balances: Array<{ currency: string | { code: string }; amount: unknown }>;
        requisites: Array<{
          id: string;
          type: string;
          number: string;
          bank?: { name: string } | null;
          currency?: string | { code: string };
          isActive: boolean;
        }>;
      }>(internalPaths.trader(traderId!));
      return {
        id: raw.id,
        email: raw.user.email,
        processingMethod: raw.processingMethod === 'FORK' ? 'FORK' : 'CARD',
        cascadeRatingMultiplier: Number(raw.cascadeRatingMultiplier ?? 1),
        payoutMinLimit: Number(raw.payoutMinLimit ?? 0),
        payoutMaxLimit: Number(raw.payoutMaxLimit ?? 0),
        overdraftLimit: Number(raw.overdraftLimit ?? 0),
        payinRate: Number(raw.payinRate ?? 0),
        payoutRate: Number(raw.payoutRate ?? 0),
        usdtTrc20DepositAddress: raw.usdtTrc20DepositAddress ?? null,
        usdtErc20DepositAddress: raw.usdtErc20DepositAddress ?? null,
        balances: raw.balances.map((b) => ({
          currency: currencyDisplayCode(b.currency),
          available: Number(b.amount),
          frozen: 0,
        })),
        requisites: raw.requisites.map((r) => ({
          id: r.id,
          type: r.type,
          number: r.number,
          bank: r.bank ?? null,
          currency: currencyDisplayCode(r.currency),
          isActive: r.isActive,
        })),
      } satisfies TraderDetail;
    },
    enabled: open && !!traderId,
  });

  useEffect(() => {
    if (!open) {
      balanceFormSeededRef.current = false;
      payoutLimitsSeededRef.current = false;
      return;
    }
    if (
      !traderDetail ||
      !canEditStaff ||
      balanceFormSeededRef.current ||
      traderDetail.id !== traderId
    ) {
      return;
    }
    setBmOverdraft(String(traderDetail.overdraftLimit ?? 0));
    setBmPayin(String(traderDetail.payinRate ?? 0));
    setBmPayout(String(traderDetail.payoutRate ?? 0));
    setBmTron(traderDetail.usdtTrc20DepositAddress ?? '');
    setBmErc20(traderDetail.usdtErc20DepositAddress ?? '');
    balanceFormSeededRef.current = true;
  }, [open, traderId, traderDetail, canEditStaff]);

  useEffect(() => {
    if (!open || !traderDetail || traderDetail.id !== traderId) {
      return;
    }
    if (payoutLimitsSeededRef.current) return;
    setMinPoolLimit(String(traderDetail.payoutMinLimit ?? 0));
    setMaxPoolLimit(String(traderDetail.payoutMaxLimit ?? 0));
    payoutLimitsSeededRef.current = true;
  }, [open, traderId, traderDetail]);

  useEffect(() => {
    if (
      !open ||
      !traderDetail ||
      !canEditStaff ||
      cascadeFormSeededRef.current ||
      traderDetail.id !== traderId
    ) {
      return;
    }
    setCascadeMethod(traderDetail.processingMethod);
    setCascadeMultiplier(String(traderDetail.cascadeRatingMultiplier ?? 1));
    cascadeFormSeededRef.current = true;
  }, [open, traderId, traderDetail, canEditStaff]);

  const invalidateDetail = () => {
    if (traderId) {
      void queryClient.invalidateQueries({ queryKey: staffTraderKeys.detail(queryPrefix, traderId) });
    }
  };

  const balanceModelMutation = useMutation({
    mutationFn: () =>
      api.patch(internalPaths.traderBalanceModel(traderId!), {
        overdraft_limit_usdt: parseDecimalInput(bmOverdraft) || 0,
        payin_rate: parseDecimalInput(bmPayin) || 0,
        payout_rate: parseDecimalInput(bmPayout) || 0,
        ...(bmTron.trim() === ''
          ? { clear_trc20_deposit_address: true }
          : { usdt_trc20_deposit_address: bmTron.trim() }),
        ...(bmErc20.trim() === ''
          ? { clear_erc20_deposit_address: true }
          : { usdt_erc20_deposit_address: bmErc20.trim() }),
      }),
    onSuccess: () => {
      balanceFormSeededRef.current = false;
      invalidateDetail();
    },
  });

  const setPayoutLimitsMutation = useMutation({
    mutationFn: ({ id, min, max }: { id: string; min: number; max: number }) =>
      api.post(internalPaths.traderPayoutLimits(id), { minLimit: min, maxLimit: max }),
    onSuccess: (_data, vars) => {
      queryClient.setQueryData<StaffTraderRow[]>(staffTraderKeys.list(queryPrefix), (old) =>
        old?.map((row) =>
          row.id !== vars.id
            ? row
            : {
                ...row,
                payoutMinLimit: vars.min,
                payoutMaxLimit: vars.max,
              },
        ),
      );
      void queryClient.invalidateQueries({ queryKey: staffKeys.usersDirectory(queryPrefix) });
      payoutLimitsSeededRef.current = false;
      invalidateDetail();
    },
  });

  const toggleRequisiteMutation = useMutation({
    mutationFn: ({ id, makeActive }: { id: string; makeActive: boolean }) =>
      makeActive
        ? api.patch(internalPaths.requisiteActivate(id))
        : api.patch(internalPaths.requisiteDeactivate(id)),
    onSuccess: () => invalidateDetail(),
  });

  const cascadeRoutingMutation = useMutation({
    mutationFn: () =>
      api.patch<{
        processingMethod: string;
        cascadeRatingMultiplier: unknown;
        _meta?: { method_policy: CascadeMethodPolicy };
      }>(internalPaths.traderCascadeRouting(traderId!), {
        processing_method: cascadeMethod,
        cascade_rating_multiplier: parseDecimalInput(cascadeMultiplier) || 1,
      }),
    onSuccess: () => {
      cascadeFormSeededRef.current = false;
      void queryClient.invalidateQueries({ queryKey: cascadeKeys.methodPolicy() });
      invalidateDetail();
    },
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      variant="fullscreen"
      title="Trader settings"
      subtitle={traderDetail?.email}
    >
      {detailLoading ? (
        <div className="flex justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent-blue border-t-transparent" />
        </div>
      ) : traderDetail ? (
        <div className="mx-auto max-w-6xl space-y-10">
          {canEditStaff && traderId ? (
            <div className="grid gap-8 lg:grid-cols-2 lg:items-start">
              <div className={sectionShell}>
                <div>
                  <h3 className="text-base font-semibold text-text-primary">Balance model</h3>
                  <p className="mt-1 text-xs text-text-muted">
                    Block 5: rates as fractions (e.g. pay-in 0.01 = +1%). Deposit addresses are
                    monitored when set (Tron / ERC-20). Leave an address field empty and save to
                    remove it.
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Input
                    label="Overdraft limit (USDT)"
                    inputMode="decimal"
                    value={bmOverdraft}
                    onChange={(e) => setBmOverdraft(e.target.value)}
                  />
                  <Input
                    label="Pay-In rate (fraction)"
                    inputMode="decimal"
                    value={bmPayin}
                    onChange={(e) => setBmPayin(e.target.value)}
                  />
                  <Input
                    label="Pay-Out rate (fraction)"
                    inputMode="decimal"
                    value={bmPayout}
                    onChange={(e) => setBmPayout(e.target.value)}
                  />
                  <Input
                    label="USDT TRC-20 deposit address"
                    value={bmTron}
                    onChange={(e) => setBmTron(e.target.value)}
                  />
                  <Input
                    className="sm:col-span-2"
                    label="USDT ERC-20 deposit address (Ethereum)"
                    value={bmErc20}
                    onChange={(e) => setBmErc20(e.target.value)}
                  />
                </div>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => balanceModelMutation.mutate()}
                  loading={balanceModelMutation.isPending}
                >
                  Save balance settings
                </Button>
              </div>

              <div className={sectionShell}>
                <div>
                  <h3 className="text-base font-semibold text-text-primary">Payout pool limits</h3>
                  <p className="mt-1 text-xs text-text-muted">
                    Min and max order amounts visible in the pool. Use <strong>0</strong> for no
                    limit.
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <NumberInput
                    label="Min amount (0 = no min)"
                    variant="amount"
                    min={0}
                    value={minPoolLimit}
                    onChange={(e) => setMinPoolLimit(e.target.value)}
                    placeholder="0"
                  />
                  <NumberInput
                    label="Max amount (0 = no max)"
                    variant="amount"
                    min={0}
                    value={maxPoolLimit}
                    onChange={(e) => setMaxPoolLimit(e.target.value)}
                    placeholder="0"
                  />
                </div>
                <div className="flex justify-end">
                  <Button
                    variant="primary"
                    loading={setPayoutLimitsMutation.isPending}
                    onClick={() =>
                      setPayoutLimitsMutation.mutate({
                        id: traderId,
                        min: parseDecimalInput(minPoolLimit) || 0,
                        max: parseDecimalInput(maxPoolLimit) || 0,
                      })
                    }
                  >
                    Save pool limits
                  </Button>
                </div>
              </div>
            </div>
          ) : null}

          <section className={sectionShell}>
            <div>
              <h3 className="text-base font-semibold text-text-primary">Pay-In cascade routing</h3>
              <p className="mt-1 text-xs text-text-muted">
                Processing method (CARD vs FORK) controls Fork autolimits and which tier competes in
                the Pay-In cascade. Traders cannot change this themselves.
              </p>
            </div>
            <div className="flex flex-wrap items-end gap-4">
              <div className="min-w-[10rem]">
                <p className="text-xs text-text-muted">Current method</p>
                <p className="mt-1 text-sm font-medium text-text-primary">
                  {traderDetail.processingMethod}
                </p>
              </div>
              <div className="min-w-[10rem]">
                <p className="text-xs text-text-muted">Cascade rating multiplier</p>
                <p className="mt-1 text-sm font-medium text-text-primary">
                  {traderDetail.cascadeRatingMultiplier}
                </p>
              </div>
            </div>
            {canEditStaff && traderId ? (
              <div className="space-y-3 border-t border-border-primary pt-4">
                <Select
                  label="Processing method"
                  options={[
                    { value: 'CARD', label: 'CARD' },
                    { value: 'FORK', label: 'FORK' },
                  ]}
                  value={cascadeMethod}
                  onChange={(e) => setCascadeMethod(e.target.value as 'CARD' | 'FORK')}
                />
                <NumberInput
                  label="Cascade rating multiplier (0.01–100)"
                  variant="amount"
                  min={0.01}
                  max={100}
                  value={cascadeMultiplier}
                  onChange={(e) => setCascadeMultiplier(e.target.value)}
                />
                {methodPolicy ? (
                  <p
                    className={`text-xs ${methodPolicy.matches_rule ? 'text-text-muted' : 'text-accent-yellow'}`}
                  >
                    Method targets sum: {methodPolicy.method_share_sum_percent.toFixed(2)}%.{' '}
                    {methodPolicy.matches_rule
                      ? 'Within policy.'
                      : 'Does not match policy yet — adjust Fork / Card / Provider shares on the cascade dashboard.'}
                  </p>
                ) : null}
                <p className="text-xs text-text-muted">{CASCADE_METHOD_HINT}</p>
                <Button
                  type="button"
                  size="sm"
                  loading={cascadeRoutingMutation.isPending}
                  onClick={() => cascadeRoutingMutation.mutate()}
                >
                  Save cascade routing
                </Button>
              </div>
            ) : null}
          </section>

          <section>
            <h3 className="mb-3 text-base font-semibold text-text-primary">Balances</h3>
            {traderDetail.balances.length === 0 ? (
              <p className="text-sm text-text-muted">No balances for this trader yet.</p>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                {traderDetail.balances.map((b) => (
                  <div
                    key={b.currency}
                    className="rounded-xl border border-border-primary bg-bg-tertiary/80 p-4 text-sm"
                  >
                    <p className="text-text-muted">{b.currency}</p>
                    <p className="mt-1 font-mono text-base font-medium text-text-primary">
                      {b.available.toLocaleString()}
                    </p>
                    {b.frozen > 0 && (
                      <p className="mt-1 text-xs text-accent-yellow">
                        Frozen: {b.frozen.toLocaleString()}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          <section>
            <h3 className="mb-3 text-base font-semibold text-text-primary">
              Requisites ({traderDetail.requisites.length})
            </h3>
            {traderDetail.requisites.length === 0 ? (
              <p className="text-sm text-text-muted">No requisites on file.</p>
            ) : (
              <div className="max-h-[min(28rem,45vh)] space-y-2 overflow-y-auto pr-1">
                {traderDetail.requisites.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center justify-between rounded-xl border border-border-primary bg-bg-tertiary/60 px-4 py-3 text-sm"
                  >
                    <div className="min-w-0">
                      <span className="font-mono text-xs text-text-secondary">{r.number}</span>
                      <span className="ml-2 text-text-muted">{r.bank?.name ?? '—'}</span>
                      <span className="ml-1 text-xs uppercase text-text-muted">{r.type}</span>
                      <span className="ml-2 text-xs text-text-muted">{r.currency}</span>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <StatusBadge status={r.isActive ? 'active' : 'inactive'} />
                      <IconButton
                        label={r.isActive ? 'Deactivate requisite' : 'Activate requisite'}
                        variant="ghost"
                        disabled={toggleRequisiteMutation.isPending}
                        onClick={() =>
                          toggleRequisiteMutation.mutate({ id: r.id, makeActive: !r.isActive })
                        }
                      >
                        {r.isActive ? (
                          <PowerOff className="h-4 w-4 text-accent-red" />
                        ) : (
                          <Power className="h-4 w-4 text-accent-green" />
                        )}
                      </IconButton>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      ) : null}
    </Modal>
  );
}
