import { Settings, ToggleLeft, ToggleRight } from 'lucide-react';
import { StatusBadge } from '@/components/ui/badge';
import { IconButton } from '@/components/ui/icon-button';
import type { UseMutationResult } from '@tanstack/react-query';
import type { StaffTraderRow } from './staff-trader-types';

export function buildStaffTradersColumns(opts: {
  toggleMutation: UseMutationResult<unknown, Error, { id: string; enabled: boolean }>;
  onOpenTraderDetail: (row: StaffTraderRow) => void;
}) {
  const { toggleMutation, onOpenTraderDetail } = opts;

  return [
    {
      key: 'name',
      header: 'Name',
      render: (row: StaffTraderRow) => (
        <span className="font-medium text-text-primary">{row.name}</span>
      ),
    },
    { key: 'email', header: 'Email' },
    {
      key: 'status',
      header: 'Status',
      className: 'text-center',
      render: (row: StaffTraderRow) => <StatusBadge status={row.status} />,
    },
    {
      key: 'activeRequisitesCount',
      header: 'Requisites',
      className: 'text-end tabular-nums',
      render: (row: StaffTraderRow) => <span>{row.activeRequisitesCount}</span>,
    },
    {
      key: 'totalVolume',
      header: 'Volume',
      className: 'text-end tabular-nums',
      render: (row: StaffTraderRow) => (
        <span className="font-mono">${row.totalVolume.toLocaleString()}</span>
      ),
    },
    {
      key: 'ordersCount',
      header: 'Orders',
      className: 'text-end tabular-nums',
      render: (row: StaffTraderRow) => <span>{row.ordersCount}</span>,
    },
    {
      key: 'payoutLimits',
      header: 'Payout Limits',
      className: 'text-end tabular-nums font-mono',
      render: (row: StaffTraderRow) => (
        <span className="text-xs text-text-muted font-mono">
          {row.payoutMinLimit === 0 && row.payoutMaxLimit === 0
            ? 'No limit'
            : `${row.payoutMinLimit ?? 0} – ${row.payoutMaxLimit ?? 0}`}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      className: 'text-end',
      render: (row: StaffTraderRow) => (
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <IconButton
            label="Trader settings (balances, limits, requisites)"
            variant="ghost"
            onClick={() => onOpenTraderDetail(row)}
          >
            <Settings className="h-4 w-4" />
          </IconButton>
          <IconButton
            label={row.status === 'active' ? 'Disable trader' : 'Enable trader'}
            variant="ghost"
            onClick={() =>
              toggleMutation.mutate({ id: row.id, enabled: row.status !== 'active' })
            }
          >
            {row.status === 'active' ? (
              <ToggleRight className="h-4 w-4 text-accent-green" />
            ) : (
              <ToggleLeft className="h-4 w-4" />
            )}
          </IconButton>
        </div>
      ),
    },
  ];
}
