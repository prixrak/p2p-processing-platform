'use client';

import { History, Pencil } from 'lucide-react';
import { IconButton } from '@/components/ui/icon-button';
import { Badge } from '@/components/ui/badge';
import { LimitUsageBar } from '@/components/ui/limit-usage-bar';
import { Table } from '@/components/ui/table';
import type { UseMutationResult } from '@tanstack/react-query';
import type { PayinAssignRangeRow, RequisiteApiRow } from './types';
import { compactAmount, num, remainingFromLimitAndConsumed, volumePart } from './utils';

function inactiveRequisiteSubtitle(r: RequisiteApiRow): string {
  switch (r.disabledReason) {
    case 'LIMIT_AMOUNT':
      return 'Turned off automatically — total amount limit reached.';
    case 'LIMIT_TX':
      return 'Turned off automatically — operation limit reached.';
    case 'MANUAL':
      return 'Turned off manually.';
    default:
      return 'Inactive.';
  }
}

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
  /** When false, requisite switches are disabled and Active shows off (nothing in the group routes pay-ins). */
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
        const lim = num(r.limitTotalAmount);
        const usedAmt = Math.max(
          0,
          Number.isFinite(lim) && lim > 0
            ? Math.min(num(r.usedAmount), lim)
            : num(r.usedAmount),
        );
        const hasVolumeBreakdown = r.volume != null;
        const v = r.volume ?? {
          amountInProcessing: 0,
          amountCompleted: 0,
          amountRemaining: Math.max(0, lim - usedAmt),
          opsInProcessing: 0,
          opsCompleted: 0,
          opsRemaining: Math.max(0, r.limitTotalOps - r.usedOps),
        };
        const completedAmt = volumePart(v.amountCompleted);
        const processingAmt = volumePart(v.amountInProcessing);
        const remainingAmt = hasVolumeBreakdown
          ? remainingFromLimitAndConsumed(lim, completedAmt + processingAmt)
          : volumePart(v.amountRemaining);
        const amountTooltip = (
          <div className="space-y-1 text-left">
            <div>
              <span className="text-text-muted">Completed amount: </span>
              <span className="tabular-nums font-medium text-success">
                {completedAmt.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </span>
            </div>
            <div>
              <span className="text-text-muted">Amount in processing: </span>
              <span className="tabular-nums font-medium text-amber-400">
                {processingAmt.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </span>
            </div>
            <div>
              <span className="text-text-muted">Amount limit: </span>
              <span className="tabular-nums font-medium text-danger">
                {lim.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </span>
            </div>
            <div>
              <span className="text-text-muted">Remaining: </span>
              <span className="tabular-nums font-medium text-accent">
                {remainingAmt.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        );
        return (
          <LimitUsageBar
            used={completedAmt}
            limit={lim}
            processing={processingAmt}
            usedSegmentLabel={compactAmount(completedAmt)}
            processingSegmentLabel={processingAmt > 0 ? compactAmount(processingAmt) : ''}
            remainingSegmentLabel={compactAmount(remainingAmt)}
            tooltip={amountTooltip}
          />
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
                  <span className="ml-1 text-amber-600">
                    (not in cascade pool{r.isActive ? '' : '; inactive requisite is excluded'})
                  </span>
                ) : null}
              </div>
            ) : ar && !ar.participates_in_cascade ? (
              <div className="text-[10px] text-amber-600">
                Not in cascade assignment pool
                {!r.isActive ? ' (inactive requisite is excluded)' : ''}
              </div>
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
        const limOpsRaw = Number(r.limitTotalOps);
        const limOps = Number.isFinite(limOpsRaw) && limOpsRaw > 0 ? limOpsRaw : 1;
        const usedOpsClamped = Math.max(
          0,
          Math.min(Math.floor(volumePart(r.usedOps)), limOps),
        );
        const hasVolumeBreakdown = r.volume != null;
        const v = r.volume ?? {
          amountInProcessing: 0,
          amountCompleted: 0,
          amountRemaining: 0,
          opsInProcessing: 0,
          opsCompleted: 0,
          opsRemaining: Math.max(0, limOps - usedOpsClamped),
        };
        const completedOps = Math.floor(volumePart(v.opsCompleted));
        const processingOps = Math.floor(volumePart(v.opsInProcessing));
        const remOps = hasVolumeBreakdown
          ? remainingFromLimitAndConsumed(limOps, completedOps + processingOps)
          : Math.floor(volumePart(v.opsRemaining));
        const opsTooltip = (
          <div className="space-y-1 text-left">
            <div>
              <span className="text-text-muted">Completed operations: </span>
              <span className="tabular-nums font-medium text-success">{completedOps}</span>
            </div>
            <div>
              <span className="text-text-muted">Operations in processing: </span>
              <span className="tabular-nums font-medium text-amber-400">{processingOps}</span>
            </div>
            <div>
              <span className="text-text-muted">Operation limit: </span>
              <span className="tabular-nums font-medium text-danger">{limOps}</span>
            </div>
            <div>
              <span className="text-text-muted">Available: </span>
              <span className="tabular-nums font-medium text-accent">{remOps}</span>
            </div>
          </div>
        );
        return (
          <LimitUsageBar
            used={completedOps}
            limit={limOps}
            processing={processingOps}
            usedSegmentLabel={String(completedOps)}
            processingSegmentLabel={processingOps > 0 ? String(processingOps) : ''}
            remainingSegmentLabel={String(remOps)}
            tooltip={opsTooltip}
            size="sm"
          />
        );
      },
    },
    {
      key: 'active',
      header: 'Active',
      render: (r: RequisiteApiRow) => {
        const acceptingPayIns = groupIsActive && r.isActive;
        return (
          <div className="flex flex-col gap-0.5">
            <input
              type="checkbox"
              role="switch"
              className="accent-accent-blue"
              checked={acceptingPayIns}
              disabled={!groupIsActive}
              title={
                !groupIsActive
                  ? 'Payment group is off — requisites cannot accept Pay-In assignments'
                  : undefined
              }
              onChange={(e) => {
                if (!groupIsActive) return;
                toggleMutation.mutate({
                  id: r.id,
                  makeActive: e.target.checked,
                });
              }}
            />
            {groupIsActive && !r.isActive ? (
              <span className="max-w-[12rem] text-[10px] leading-tight text-text-muted">
                {inactiveRequisiteSubtitle(r)}
              </span>
            ) : null}
          </div>
        );
      },
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (r: RequisiteApiRow) => (
        <div className="flex flex-nowrap items-center justify-end gap-2">
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
