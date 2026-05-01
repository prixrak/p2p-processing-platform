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
import type { StaffRolePrefix } from './query-keys';
import { staffTraderKeys } from './query-keys';

interface TraderDetail {
  id: string;
  name: string;
  email: string;
  status: string;
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
  orders: Array<{
    id: string;
    type: string;
    amount: number;
    currency: string;
    status: string;
    createdAt: string;
  }>;
}

export function TraderDetailModal({
  open,
  onClose,
  traderId,
  traderName,
  queryPrefix,
}: {
  open: boolean;
  onClose: () => void;
  traderId: string | null;
  traderName: string;
  queryPrefix: StaffRolePrefix;
}) {
  const queryClient = useQueryClient();
  const [bmOverdraft, setBmOverdraft] = useState('');
  const [bmPayin, setBmPayin] = useState('');
  const [bmPayout, setBmPayout] = useState('');
  const [bmTron, setBmTron] = useState('');
  const [bmClearTron, setBmClearTron] = useState(false);
  const [bmErc20, setBmErc20] = useState('');
  const [bmClearErc20, setBmClearErc20] = useState(false);
  const balanceFormSeededRef = useRef(false);

  useEffect(() => {
    balanceFormSeededRef.current = false;
  }, [traderId]);

  const { data: traderDetail, isLoading: detailLoading } = useQuery<TraderDetail>({
    queryKey: traderId ? staffTraderKeys.detail(queryPrefix, traderId) : ['noop'],
    queryFn: async () => {
      const raw = await api.get<{
        id: string;
        isActive: boolean;
        user: { email: string };
        overdraftLimit?: unknown;
        payinRate?: unknown;
        payoutRate?: unknown;
        usdtTrc20DepositAddress?: string | null;
        usdtErc20DepositAddress?: string | null;
        balances: Array<{ currency: string; amount: unknown }>;
        requisites: Array<{
          id: string;
          type: string;
          number: string;
          bank?: { name: string } | null;
          currency: string;
          isActive: boolean;
        }>;
      }>(internalPaths.trader(traderId!));
      return {
        id: raw.id,
        name: raw.user.email.split('@')[0] ?? raw.user.email,
        email: raw.user.email,
        status: raw.isActive ? 'active' : 'inactive',
        overdraftLimit: Number(raw.overdraftLimit ?? 0),
        payinRate: Number(raw.payinRate ?? 0),
        payoutRate: Number(raw.payoutRate ?? 0),
        usdtTrc20DepositAddress: raw.usdtTrc20DepositAddress ?? null,
        usdtErc20DepositAddress: raw.usdtErc20DepositAddress ?? null,
        balances: raw.balances.map((b) => ({
          currency: b.currency,
          available: Number(b.amount),
          frozen: 0,
        })),
        requisites: raw.requisites.map((r) => ({
          id: r.id,
          type: r.type,
          number: r.number,
          bank: r.bank ?? null,
          currency: r.currency,
          isActive: r.isActive,
        })),
        orders: [],
      } satisfies TraderDetail;
    },
    enabled: open && !!traderId,
  });

  useEffect(() => {
    if (!open) {
      balanceFormSeededRef.current = false;
      return;
    }
    if (
      !traderDetail ||
      queryPrefix !== 'admin' ||
      balanceFormSeededRef.current ||
      traderDetail.id !== traderId
    ) {
      return;
    }
    setBmOverdraft(String(traderDetail.overdraftLimit ?? 0));
    setBmPayin(String(traderDetail.payinRate ?? 0));
    setBmPayout(String(traderDetail.payoutRate ?? 0));
    setBmTron(traderDetail.usdtTrc20DepositAddress ?? '');
    setBmClearTron(false);
    setBmErc20(traderDetail.usdtErc20DepositAddress ?? '');
    setBmClearErc20(false);
    balanceFormSeededRef.current = true;
  }, [open, traderId, traderDetail, queryPrefix]);

  const balanceModelMutation = useMutation({
    mutationFn: () =>
      api.patch(internalPaths.traderBalanceModel(traderId!), {
        overdraft_limit_usdt: parseFloat(bmOverdraft) || 0,
        payin_rate: parseFloat(bmPayin) || 0,
        payout_rate: parseFloat(bmPayout) || 0,
        ...(bmClearTron ? { clear_trc20_deposit_address: true } : {}),
        ...(!bmClearTron && bmTron.trim()
          ? { usdt_trc20_deposit_address: bmTron.trim() }
          : {}),
        ...(bmClearErc20 ? { clear_erc20_deposit_address: true } : {}),
        ...(!bmClearErc20 && bmErc20.trim()
          ? { usdt_erc20_deposit_address: bmErc20.trim() }
          : {}),
      }),
    onSuccess: () => {
      if (traderId) {
        balanceFormSeededRef.current = false;
        queryClient.invalidateQueries({ queryKey: staffTraderKeys.detail(queryPrefix, traderId) });
      }
    },
  });

  const toggleRequisiteMutation = useMutation({
    mutationFn: ({ id, makeActive }: { id: string; makeActive: boolean }) =>
      makeActive
        ? api.patch(internalPaths.requisiteActivate(id))
        : api.patch(internalPaths.requisiteDeactivate(id)),
    onSuccess: () => {
      if (traderId) {
        queryClient.invalidateQueries({ queryKey: staffTraderKeys.detail(queryPrefix, traderId) });
      }
    },
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Trader: ${traderName}`}
      className="max-w-2xl"
    >
      {detailLoading ? (
        <div className="flex justify-center py-8">
          <div className="w-6 h-6 border-2 border-accent-blue border-t-transparent rounded-full animate-spin" />
        </div>
      ) : traderDetail ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-text-muted">Email</p>
              <p className="text-text-primary">{traderDetail.email}</p>
            </div>
            <div>
              <p className="text-text-muted">Status</p>
              <StatusBadge status={traderDetail.status} />
            </div>
          </div>

          {queryPrefix === 'admin' && traderId && (
            <div className="rounded-lg border border-border-primary p-3 space-y-3">
              <h4 className="text-sm font-medium text-text-primary">Balance model (Block 5)</h4>
              <p className="text-xs text-text-muted">
                Rates are fractions (e.g. pay-in 0.01 = +1%). Deposit addresses are monitored by
                workers when set (Tron / Ethereum ERC-20).
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input
                  label="Overdraft limit (USDT)"
                  value={bmOverdraft}
                  onChange={(e) => setBmOverdraft(e.target.value)}
                />
                <Input
                  label="Pay-In rate (fraction)"
                  value={bmPayin}
                  onChange={(e) => setBmPayin(e.target.value)}
                />
                <Input
                  label="Pay-Out rate (fraction)"
                  value={bmPayout}
                  onChange={(e) => setBmPayout(e.target.value)}
                />
                <Input
                  label="USDT TRC-20 deposit address"
                  value={bmTron}
                  onChange={(e) => setBmTron(e.target.value)}
                  disabled={bmClearTron}
                />
                <Input
                  label="USDT ERC-20 deposit address (Ethereum)"
                  value={bmErc20}
                  onChange={(e) => setBmErc20(e.target.value)}
                  disabled={bmClearErc20}
                />
              </div>
              <label className="flex items-center gap-2 text-xs text-text-secondary">
                <input
                  type="checkbox"
                  checked={bmClearTron}
                  onChange={(e) => setBmClearTron(e.target.checked)}
                />
                Clear Tron deposit address
              </label>
              <label className="flex items-center gap-2 text-xs text-text-secondary">
                <input
                  type="checkbox"
                  checked={bmClearErc20}
                  onChange={(e) => setBmClearErc20(e.target.checked)}
                />
                Clear ERC-20 deposit address
              </label>
              <Button
                type="button"
                size="sm"
                onClick={() => balanceModelMutation.mutate()}
                loading={balanceModelMutation.isPending}
              >
                Save balance settings
              </Button>
            </div>
          )}

          {traderDetail.balances.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-text-primary mb-2">Balances</h4>
              <div className="grid grid-cols-3 gap-3">
                {traderDetail.balances.map((b) => (
                  <div
                    key={b.currency}
                    className="bg-bg-tertiary rounded-lg p-3 text-sm"
                  >
                    <p className="text-text-muted">{b.currency}</p>
                    <p className="text-text-primary font-mono">
                      {b.available.toLocaleString()}
                    </p>
                    {b.frozen > 0 && (
                      <p className="text-xs text-accent-yellow">
                        Frozen: {b.frozen.toLocaleString()}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {traderDetail.requisites.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-text-primary mb-2">
                Requisites ({traderDetail.requisites.length})
              </h4>
              <div className="space-y-2">
                {traderDetail.requisites.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center justify-between bg-bg-tertiary rounded-lg p-3 text-sm"
                  >
                    <div>
                      <span className="font-mono text-xs text-text-secondary">{r.number}</span>
                      <span className="text-text-muted ml-2">{r.bank?.name ?? '—'}</span>
                      <span className="text-text-muted ml-1 text-xs uppercase">{r.type}</span>
                      <span className="text-text-muted ml-2 text-xs">{r.currency}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={r.isActive ? 'active' : 'inactive'} />
                      <IconButton
                        label={r.isActive ? 'Deactivate requisite' : 'Activate requisite'}
                        variant="ghost"
                        disabled={toggleRequisiteMutation.isPending}
                        onClick={() =>
                          toggleRequisiteMutation.mutate({ id: r.id, makeActive: !r.isActive })
                        }
                        className="!min-h-8 !min-w-8 !p-1"
                      >
                        {r.isActive ? (
                          <PowerOff size={15} className="text-accent-red" />
                        ) : (
                          <Power size={15} className="text-accent-green" />
                        )}
                      </IconButton>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {traderDetail.orders.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-text-primary mb-2">
                Recent Orders
              </h4>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {traderDetail.orders.map((o) => (
                  <div
                    key={o.id}
                    className="flex items-center justify-between bg-bg-tertiary rounded-lg p-3 text-sm"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-text-muted text-xs font-mono">
                        {o.id.slice(0, 8)}
                      </span>
                      <span className="text-text-primary">
                        {o.amount.toLocaleString()} {o.currency}
                      </span>
                      <span className="text-text-muted uppercase text-xs">
                        {o.type}
                      </span>
                    </div>
                    <StatusBadge status={o.status} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : null}
    </Modal>
  );
}
