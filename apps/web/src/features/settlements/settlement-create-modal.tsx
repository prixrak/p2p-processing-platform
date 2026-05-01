'use client';

import { useMemo, useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SettlementType } from '@p2p/shared';
import { api } from '@/lib/api';
import { internalPaths } from '@/lib/internal-api';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { NumberInput } from '@/components/ui/number-input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Tabs } from '@/components/ui/tabs';
import type { StaffRolePrefix } from '@/features/traders/query-keys';
import { staffTraderKeys } from '@/features/traders/query-keys';
import {
  mergeSettlementIntoListCaches,
  type SettlementListRow,
} from '@/lib/query-cache-merge';
import { fieldErrorsFromZod } from '@/lib/validation/zod-field-errors';
import {
  settlementMerchantFieldsSchema,
  settlementPayoutFieldsSchema,
  settlementTraderFieldsSchema,
} from '@/lib/validation/schemas';
import { FormAlert } from '@/components/ui/form-alert';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { errorMessageFromUnknown } from '@/lib/error-message';

type SettlementTab = 'trader' | 'payout' | 'merchant';

interface TraderOption {
  id: string;
  name: string;
}

interface TraderBalance {
  currency: string;
  available: number;
  frozen: number;
}

interface PayoutSpecialistOption {
  id: string;
  email: string;
  balance_usdt: number;
}

interface MerchantBrief {
  id: string;
  name: string;
}

interface MerchantDetail {
  balances: Array<{ currency: string; amount: string | number }>;
}

export function SettlementCreateModal({
  open,
  onClose,
  queryPrefix,
}: {
  open: boolean;
  onClose: () => void;
  queryPrefix: StaffRolePrefix;
}) {
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<SettlementTab>('trader');

  const [traderId, setTraderId] = useState('');
  const [traderSettlementType, setTraderSettlementType] = useState<'credit' | 'debit'>('credit');
  const [traderAmount, setTraderAmount] = useState('');
  const [traderCurrency, setTraderCurrency] = useState('USDT');
  const [traderNote, setTraderNote] = useState('');

  const [payoutSpecialistId, setPayoutSpecialistId] = useState('');
  const [payoutType, setPayoutType] = useState<'credit' | 'debit'>('debit');
  const [payoutAmount, setPayoutAmount] = useState('');
  const [payoutNote, setPayoutNote] = useState('');
  const [payoutUsdtAddress, setPayoutUsdtAddress] = useState('');

  const [merchantId, setMerchantId] = useState('');
  const [merchantCurrency, setMerchantCurrency] = useState('UAH');
  const [merchantDebitAmount, setMerchantDebitAmount] = useState('');
  const [manualRate, setManualRate] = useState('');
  const [usdtEquivalent, setUsdtEquivalent] = useState('');
  const [merchantUsdtAddress, setMerchantUsdtAddress] = useState('');
  const [merchantNote, setMerchantNote] = useState('');

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [confirmOpen, setConfirmOpen] = useState(false);

  const { data: traders = [] } = useQuery<TraderOption[]>({
    queryKey: staffTraderKeys.traderOptions(queryPrefix),
    queryFn: async () => {
      const res = await api.get<{
        data: Array<{ id: string; user: { email: string } }>;
      }>(`${internalPaths.traders}?page=1&limit=500`);
      return res.data.map((t) => ({
        id: t.id,
        name: t.user.email,
      }));
    },
    enabled: open && tab === 'trader',
  });

  const { data: payoutOptionsResp } = useQuery<{ data: PayoutSpecialistOption[] }>({
    queryKey: ['settlements', 'payout-specialist-options'],
    queryFn: () => api.get(internalPaths.settlementsPayoutSpecialistOptions),
    enabled: open && tab === 'payout',
  });
  const payoutOptions = payoutOptionsResp?.data ?? [];

  const { data: merchants = [] } = useQuery<MerchantBrief[]>({
    queryKey: ['merchants', 'brief-options'],
    queryFn: async () => {
      const res = await api.get<{
        data: Array<{ id: string; name: string }>;
      }>(`${internalPaths.merchants}?page=1&limit=300`);
      return res.data;
    },
    enabled: open && tab === 'merchant',
  });

  const { data: merchantDetail } = useQuery<MerchantDetail>({
    queryKey: ['merchants', merchantId, 'balances'],
    queryFn: () => api.get(internalPaths.merchant(merchantId)),
    enabled: open && tab === 'merchant' && Boolean(merchantId),
  });

  const merchantBalances = merchantDetail?.balances ?? [];

  useEffect(() => {
    if (merchantBalances.length > 0) {
      const has = merchantBalances.some((b) => b.currency === merchantCurrency);
      if (!has) {
        setMerchantCurrency(merchantBalances[0].currency);
      }
    }
  }, [merchantId, merchantBalances, merchantCurrency]);

  const merchantAvailable = useMemo(() => {
    const row = merchantBalances.find((b) => b.currency === merchantCurrency);
    return row ? Number(row.amount ?? 0) : 0;
  }, [merchantBalances, merchantCurrency]);

  const { data: traderBalances } = useQuery<TraderBalance[]>({
    queryKey: [queryPrefix, 'traders', traderId, 'balances'],
    queryFn: () => api.get(internalPaths.traderBalances(traderId)),
    enabled: open && tab === 'trader' && !!traderId,
  });

  const { data: currencyOptions = [] } = useQuery<{ code: string }[]>({
    queryKey: ['currencies'],
    queryFn: async () => {
      const res = await api.get<{ data: { code: string }[] } | { code: string }[]>(
        internalPaths.currencies,
      );
      return Array.isArray(res) ? res : res.data;
    },
    enabled: open,
  });

  const createMutation = useMutation<SettlementListRow, Error, void>({
    mutationFn: () => {
      if (tab === 'trader') {
        return api.post<SettlementListRow>(internalPaths.settlements, {
          traderId,
          type:
            traderSettlementType === 'credit' ? SettlementType.CREDIT : SettlementType.DEBIT,
          amount: parseFloat(traderAmount),
          currency: traderCurrency,
          note: traderNote,
        });
      }
      if (tab === 'payout') {
        return api.post<SettlementListRow>(internalPaths.settlements, {
          payoutTraderId: payoutSpecialistId,
          type: payoutType === 'credit' ? SettlementType.CREDIT : SettlementType.DEBIT,
          amount: parseFloat(payoutAmount),
          currency: 'USDT',
          note: payoutNote,
          usdtAddress: payoutUsdtAddress.trim() || undefined,
        });
      }
      return api.post<SettlementListRow>(internalPaths.settlements, {
        merchantId,
        type: SettlementType.DEBIT,
        amount: parseFloat(merchantDebitAmount),
        currency: merchantCurrency,
        manualRate: parseFloat(manualRate),
        usdtEquivalent: parseFloat(usdtEquivalent),
        usdtAddress: merchantUsdtAddress.trim(),
        note: merchantNote,
      });
    },
    onSuccess: (created) => {
      mergeSettlementIntoListCaches(queryClient, queryPrefix, created);
      resetForm();
    },
  });

  useEffect(() => {
    if (!open) return;
    setFieldErrors({});
    setConfirmOpen(false);
    createMutation.reset();
  }, [open]);

  function resetForm() {
    setTraderId('');
    setTraderSettlementType('credit');
    setTraderAmount('');
    setTraderCurrency('USDT');
    setTraderNote('');
    setPayoutSpecialistId('');
    setPayoutType('debit');
    setPayoutAmount('');
    setPayoutNote('');
    setPayoutUsdtAddress('');
    setMerchantId('');
    setMerchantCurrency('UAH');
    setMerchantDebitAmount('');
    setManualRate('');
    setUsdtEquivalent('');
    setMerchantUsdtAddress('');
    setMerchantNote('');
    setTab('trader');
    setFieldErrors({});
    setConfirmOpen(false);
    onClose();
  }

  function handleTabChange(next: SettlementTab) {
    setTab(next);
    createMutation.reset();
    setFieldErrors({});
  }

  function requestCreate() {
    setFieldErrors({});
    createMutation.reset();
    if (tab === 'trader') {
      const r = settlementTraderFieldsSchema.safeParse({
        traderId,
        traderAmount,
        traderCurrency,
        traderNote,
      });
      if (!r.success) {
        setFieldErrors(fieldErrorsFromZod(r.error));
        return;
      }
    } else if (tab === 'payout') {
      const r = settlementPayoutFieldsSchema.safeParse({
        payoutSpecialistId,
        payoutAmount,
        payoutUsdtAddress,
        payoutNote,
      });
      if (!r.success) {
        setFieldErrors(fieldErrorsFromZod(r.error));
        return;
      }
    } else {
      const r = settlementMerchantFieldsSchema.safeParse({
        merchantId,
        merchantDebitAmount,
        merchantCurrency,
        manualRate,
        usdtEquivalent,
        merchantUsdtAddress,
        merchantNote,
      });
      if (!r.success) {
        setFieldErrors(fieldErrorsFromZod(r.error));
        return;
      }
    }
    setConfirmOpen(true);
  }

  function confirmSummary(): string {
    if (tab === 'trader') {
      const amount = Number(String(traderAmount).replace(/,/g, ''));
      return `${traderSettlementType === 'credit' ? 'Credit' : 'Debit'} ${amount.toLocaleString()} ${traderCurrency} for the selected trader. This updates the ledger immediately.`;
    }
    if (tab === 'payout') {
      const amount = Number(String(payoutAmount).replace(/,/g, ''));
      return `${payoutType === 'credit' ? 'Credit' : 'Debit'} ${amount.toLocaleString()} USDT for the Pay-Out specialist.`;
    }
    const fiat = Number(String(merchantDebitAmount).replace(/,/g, ''));
    const usdt = Number(String(usdtEquivalent).replace(/,/g, ''));
    return `Debit ${fiat.toLocaleString()} ${merchantCurrency} from the merchant and record ${usdt.toLocaleString()} USDT paid out to the listed address.`;
  }

  const currentTraderBalance = traderBalances?.find((b) => b.currency === traderCurrency);

  const payoutSelected = payoutOptions.find((p) => p.id === payoutSpecialistId);

  const submitBusy = createMutation.isPending;

  return (
    <>
    <ConfirmDialog
      open={confirmOpen}
      onOpenChange={setConfirmOpen}
      tone="danger"
      title="Create this settlement?"
      description={confirmSummary()}
      confirmLabel="Yes, create settlement"
      cancelLabel="Back to edit"
      loading={submitBusy}
      onConfirm={() => {
        setConfirmOpen(false);
        createMutation.mutate();
      }}
    />
    <Modal open={open} onClose={resetForm} title="Create settlement">
      <div className="space-y-4">
        <Tabs
          active={tab}
          onChange={(k) => handleTabChange(k as SettlementTab)}
          tabs={[
            { key: 'trader', label: 'Standard trader' },
            { key: 'payout', label: 'Pay-Out specialist' },
            { key: 'merchant', label: 'Merchant' },
          ]}
        />

        {tab === 'trader' && (
          <>
            <p className="text-xs text-text-muted leading-relaxed">
              USDT credits booked as ledger TOP_UP (manual top-up confirmation). Other currencies use
              manual credit/debit.
            </p>
            <Select
              label="Trader"
              placeholder="Select trader"
              options={[
                { value: '', label: 'Select trader' },
                ...traders.map((t) => ({ value: t.id, label: t.name })),
              ]}
              value={traderId}
              onChange={(e) => setTraderId(e.target.value)}
              error={fieldErrors.traderId}
              required
            />

            <div className="grid grid-cols-2 gap-4">
              <Select
                label="Type"
                options={[
                  { value: 'credit', label: 'Credit (fund cabinet)' },
                  { value: 'debit', label: 'Debit (withdraw / adjust)' },
                ]}
                value={traderSettlementType}
                onChange={(e) =>
                  setTraderSettlementType(e.target.value as 'credit' | 'debit')
                }
              />
              <Select
                label="Currency"
                options={
                  currencyOptions.length > 0
                    ? currencyOptions.map((c) => ({ value: c.code, label: c.code }))
                    : [{ value: 'USDT', label: 'USDT' }]
                }
                value={traderCurrency}
                onChange={(e) => setTraderCurrency(e.target.value)}
                error={fieldErrors.traderCurrency}
              />
            </div>

            <NumberInput
              label="Amount"
              variant="amount"
              value={traderAmount}
              onChange={(e) => setTraderAmount(e.target.value)}
              placeholder="0.00"
              min={0}
              error={fieldErrors.traderAmount}
            />

            <Textarea
              label="Note"
              value={traderNote}
              onChange={(e) => setTraderNote(e.target.value)}
              rows={2}
              placeholder="Optional note…"
            />

            {traderId && currentTraderBalance && (
              <div className="bg-bg-tertiary rounded-lg p-4 text-sm">
                <p className="text-text-muted mb-2">Balance preview</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-text-muted text-xs">Current</p>
                    <p className="text-text-primary font-mono">
                      {currentTraderBalance.available.toLocaleString()} {traderCurrency}
                    </p>
                  </div>
                  <div>
                    <p className="text-text-muted text-xs">After operation</p>
                    <p
                      className={`font-mono ${
                        traderSettlementType === 'credit'
                          ? 'text-accent-green'
                          : 'text-accent-red'
                      }`}
                    >
                      {(
                        currentTraderBalance.available +
                        (traderSettlementType === 'credit' ? 1 : -1) *
                          (parseFloat(traderAmount) || 0)
                      ).toLocaleString()}{' '}
                      {traderCurrency}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {tab === 'payout' && (
          <>
            <p className="text-xs text-text-muted leading-relaxed">
              Platform pays accumulated USDT to the specialist (usually DEBIT cabinet balance).
              Optionally record proof address for audit when debiting for settlement.
            </p>
            <Select
              label="Pay-Out specialist"
              placeholder="Select specialist"
              options={[
                { value: '', label: 'Select specialist' },
                ...payoutOptions.map((p) => ({
                  value: p.id,
                  label: `${p.email} (${p.balance_usdt.toFixed(2)} USDT)`,
                })),
              ]}
              value={payoutSpecialistId}
              onChange={(e) => setPayoutSpecialistId(e.target.value)}
              error={fieldErrors.payoutSpecialistId}
              required
            />

            <div className="grid grid-cols-2 gap-4">
              <Select
                label="Settlement type"
                options={[
                  { value: 'debit', label: 'Debit (release USDT to trader)' },
                  { value: 'credit', label: 'Credit (adjustment)' },
                ]}
                value={payoutType}
                onChange={(e) => setPayoutType(e.target.value as 'credit' | 'debit')}
              />
            </div>

            <NumberInput
              label="Amount (USDT)"
              variant="amount"
              value={payoutAmount}
              onChange={(e) => setPayoutAmount(e.target.value)}
              placeholder="0.00"
              min={0}
              error={fieldErrors.payoutAmount}
            />

            <Textarea
              label="Destination USDT address (audit)"
              value={payoutUsdtAddress}
              onChange={(e) => setPayoutUsdtAddress(e.target.value)}
              rows={2}
              placeholder="TR… or 0x… payout destination"
              error={fieldErrors.payoutUsdtAddress}
            />

            <Textarea
              label="Note"
              value={payoutNote}
              onChange={(e) => setPayoutNote(e.target.value)}
              rows={2}
              placeholder="Optional note…"
            />

            {payoutSelected ? (
              <div className="bg-bg-tertiary rounded-lg p-3 text-xs text-text-secondary">
                <p>
                  Current balance:{' '}
                  <span className="font-mono text-text-primary">
                    {payoutSelected.balance_usdt.toFixed(4)} USDT
                  </span>
                </p>
              </div>
            ) : null}
          </>
        )}

        {tab === 'merchant' && (
          <>
            <p className="text-xs text-text-muted leading-relaxed">
              Books a fiat withdrawal after off-chain USDT payout. Enter manual rate and USDT amount
              you send (spreadsheet totals), not calculator output.
            </p>
            <Select
              label="Merchant"
              placeholder="Select merchant"
              options={[
                { value: '', label: 'Select merchant' },
                ...merchants.map((m) => ({
                  value: m.id,
                  label: m.name,
                })),
              ]}
              value={merchantId}
              onChange={(e) => setMerchantId(e.target.value)}
              error={fieldErrors.merchantId}
              required
            />

            <div className="grid grid-cols-2 gap-4">
              <Select
                label="Fiat currency"
                options={
                  merchantBalances.length
                    ? merchantBalances.map((b) => ({
                        value: b.currency,
                        label: b.currency,
                      }))
                    : [{ value: merchantCurrency, label: merchantCurrency }]
                }
                value={merchantCurrency}
                onChange={(e) => setMerchantCurrency(e.target.value)}
                error={fieldErrors.merchantCurrency}
              />
              <NumberInput
                label="Debit amount (fiat)"
                variant="amount"
                value={merchantDebitAmount}
                onChange={(e) => setMerchantDebitAmount(e.target.value)}
                min={0}
                error={fieldErrors.merchantDebitAmount}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <NumberInput
                label="Manual rate (local per 1 USDT)"
                variant="amount"
                value={manualRate}
                onChange={(e) => setManualRate(e.target.value)}
                min={0}
                error={fieldErrors.manualRate}
              />
              <NumberInput
                label="USDT paid out"
                variant="amount"
                value={usdtEquivalent}
                onChange={(e) => setUsdtEquivalent(e.target.value)}
                min={0}
                error={fieldErrors.usdtEquivalent}
              />
            </div>

            <Textarea
              label="Merchant USDT address"
              value={merchantUsdtAddress}
              onChange={(e) => setMerchantUsdtAddress(e.target.value)}
              rows={2}
              placeholder="TR… or 0x… payout destination"
              error={fieldErrors.merchantUsdtAddress}
            />

            <Textarea
              label="Note"
              value={merchantNote}
              onChange={(e) => setMerchantNote(e.target.value)}
              rows={2}
              placeholder="Optional note…"
            />

            <div className="bg-bg-tertiary rounded-lg p-3 text-xs text-text-secondary space-y-1">
              <p>
                Available in {merchantCurrency}:{' '}
                <span className="font-mono text-text-primary">
                  {merchantAvailable.toLocaleString()}
                </span>
              </p>
            </div>
          </>
        )}

        {createMutation.isError ? (
          <FormAlert>{errorMessageFromUnknown(createMutation.error)}</FormAlert>
        ) : null}

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" onClick={resetForm}>
            Cancel
          </Button>
          <Button onClick={requestCreate} loading={submitBusy} disabled={submitBusy}>
            Create settlement
          </Button>
        </div>
      </div>
    </Modal>
    </>
  );
}
