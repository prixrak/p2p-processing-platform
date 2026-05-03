'use client';

import { History, Pencil } from 'lucide-react';
import { IconButton } from '@/components/ui/icon-button';
import { Badge } from '@/components/ui/badge';
import { ProgressBar } from '@/components/ui/progress-bar';
import { Table } from '@/components/ui/table';
import type { UseMutationResult } from '@tanstack/react-query';
import type { PayinAssignRangeRow, RequisiteApiRow } from './types';
import { compactAmount, num } from './utils';

export function TraderRequisitesGroupTable({
  groupId,
  groupIsActive,
  data,
  assignRangeByReqId,
  toggleMutation,
  onEditRequisite,
  onHistory,
}: {
  groupId: string;
  /** Master switch: when false, requisites show inactive and cannot be toggled until the group is on. */
  groupIsActive: boolean;
  data: RequisiteApiRow[];
  assignRangeByReqId: Map<string, PayinAssignRangeRow>;
  toggleMutation: UseMutationResult<unknown, unknown, { id: string; makeActive: boolean }>;
  onEditRequisite: (groupId: string, req: RequisiteApiRow) => void;
  onHistory: (id: string) => void;
}) {
  const columns = [
    {
      key: 'number',
      header: 'Account number',
      render: (r: RequisiteApiRow) => (
        <span className="font-mono text-xs sm:text-sm">{r.number}</span>
      ),
    },
    {
      key: 'owner',
      header: 'Account owner',
      render: (r: RequisiteApiRow) => <span className="break-all">{r.owner}</span>,
    },
    {
      key: 'bank',
      header: 'Bank',
      render: (r: RequisiteApiRow) => r.bank?.name ?? '—',
    },
    {
      key: 'type',
      header: 'Type',
      render: (r: RequisiteApiRow) => <Badge variant="default">{r.type}</Badge>,
    },
    {
      key: 'other',
      header: 'Other banks',
      render: (r: RequisiteApiRow) => (r.acceptsOtherBanks ? 'Yes' : 'No'),
    },
    {
      key: 'vol',
      header: 'Current amount',
      className: 'min-w-[140px]',
      render: (r: RequisiteApiRow) => {
        const v = r.volume ?? {
          amountInProcessing: 0,
          amountCompleted: 0,
          amountRemaining: Math.max(0, num(r.limitTotalAmount) - num(r.usedAmount)),
        };
        const lim = num(r.limitTotalAmount);
        const usedRaw = Math.max(0, num(r.usedAmount));
        const usedAmt =
          Number.isFinite(lim) && lim > 0 ? Math.min(usedRaw, lim) : usedRaw;
        return (
          <div className="space-y-1 text-[11px] leading-tight">
            <ProgressBar label="" value={usedAmt} max={lim || 1} />
            <div className="text-text-muted">
              Processing:{' '}
              <span className="tabular-nums text-text-secondary">{compactAmount(v.amountInProcessing)}</span>
            </div>
            <div className="text-text-muted">
              Completed:{' '}
              <span className="tabular-nums text-text-secondary">{compactAmount(v.amountCompleted)}</span>
            </div>
            <div className="text-text-muted">
              Remaining:{' '}
              <span className="tabular-nums text-accent-green">{compactAmount(v.amountRemaining)}</span>
            </div>
          </div>
        );
      },
    },
    {
      key: 'range',
      header: 'Amount range',
      render: (r: RequisiteApiRow) => {
        const ar = assignRangeByReqId.get(r.id);
        const manualLo = num(r.minAmount);
        const manualHi = num(r.maxAmount);
        const hasEff = ar && ar.eff_min != null && ar.eff_max != null;
        const showAssign =
          hasEff &&
          (ar!.fork_autolimit_active ||
            !ar!.participates_in_cascade ||
            Math.abs(ar!.eff_min! - manualLo) > 0.01 ||
            Math.abs(ar!.eff_max! - manualHi) > 0.01);
        return (
          <div className="space-y-0.5">
            <span className="tabular-nums whitespace-nowrap text-xs">
              {compactAmount(manualLo)} ↔ {compactAmount(manualHi)}
            </span>
            {showAssign ? (
              <div className="text-[10px] leading-tight text-text-muted">
                Pay-In assignment:{' '}
                <span className="tabular-nums text-text-secondary">
                  {compactAmount(ar!.eff_min!)} ↔ {compactAmount(ar!.eff_max!)}
                </span>
                {!ar!.participates_in_cascade ? (
                  <span className="ml-1 text-amber-600">(not in cascade pool)</span>
                ) : null}
              </div>
            ) : ar && !ar.participates_in_cascade ? (
              <div className="text-[10px] text-amber-600">Not in cascade assignment pool</div>
            ) : null}
          </div>
        );
      },
    },
    {
      key: 'ops',
      header: 'Operation limit',
      className: 'min-w-[100px]',
      render: (r: RequisiteApiRow) => {
        const limOps = Math.max(1, r.limitTotalOps);
        const usedOps = Math.max(0, Math.min(r.usedOps, limOps));
        return <ProgressBar label="" value={usedOps} max={limOps} />;
      },
    },
    {
      key: 'active',
      header: 'Active',
      render: (r: RequisiteApiRow) => {
        const effectiveActive = groupIsActive && r.isActive;
        return (
          <input
            type="checkbox"
            role="switch"
            className="accent-accent-blue"
            checked={effectiveActive}
            disabled={!groupIsActive}
            title={
              groupIsActive
                ? undefined
                : 'Turn the payment group on to change requisite activity'
            }
            onChange={(e) => {
              if (!groupIsActive) return;
              toggleMutation.mutate({
                id: r.id,
                makeActive: e.target.checked,
              });
            }}
          />
        );
      },
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (r: RequisiteApiRow) => (
        <div className="flex flex-wrap items-center gap-2">
          <IconButton
            label="Edit requisite limits"
            variant="secondary"
            onClick={() => onEditRequisite(groupId, r)}
          >
            <Pencil className="h-4 w-4" />
          </IconButton>
          <IconButton label="View requisite history" variant="ghost" onClick={() => onHistory(r.id)}>
            <History className="h-4 w-4" />
          </IconButton>
        </div>
      ),
    },
  ];

  return (
    <Table<RequisiteApiRow>
      keyExtractor={(r) => r.id}
      data={data}
      columns={columns}
    />
  );
}
