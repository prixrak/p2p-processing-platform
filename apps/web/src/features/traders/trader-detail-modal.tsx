'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Power, PowerOff } from 'lucide-react';
import { api } from '@/lib/api';
import { internalPaths } from '@/lib/internal-api';
import { Modal } from '@/components/ui/modal';
import { StatusBadge } from '@/components/ui/badge';
import { IconButton } from '@/components/ui/icon-button';
import type { StaffRolePrefix } from './query-keys';
import { staffTraderKeys } from './query-keys';

interface TraderDetail {
  id: string;
  name: string;
  email: string;
  status: string;
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

  const { data: traderDetail, isLoading: detailLoading } = useQuery<TraderDetail>({
    queryKey: traderId ? staffTraderKeys.detail(queryPrefix, traderId) : ['noop'],
    queryFn: async () => {
      const raw = await api.get<{
        id: string;
        isActive: boolean;
        user: { email: string };
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

  const toggleRequisiteMutation = useMutation({
    mutationFn: ({ id, makeActive }: { id: string; makeActive: boolean }) =>
      makeActive
        ? api.patch(`/api/requisites/${id}/activate`)
        : api.patch(`/api/requisites/${id}/deactivate`),
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
