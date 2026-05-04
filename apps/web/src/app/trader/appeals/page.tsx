'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Eye,
  ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Badge } from '@/components/ui/badge';
import { Table } from '@/components/ui/table';
import { Tabs } from '@/components/ui/tabs';
import { Modal } from '@/components/ui/modal';
import { api } from '@/lib/api';
import { internalPaths } from '@/lib/internal-api';
import { traderKeys } from '@/lib/query-keys';
import { AuthorizedFilePreview } from '@/components/files/authorized-file-preview';
import { formatCurrency, formatDate, formatDateFull, shortId, cn } from '@/lib/utils';
import { AppealStatus } from '@p2p/shared';
import type { AppealDto } from '@p2p/shared';

interface AppealsListResponse {
  items: AppealDto[];
  total: number;
  page: number;
  limit: number;
}

const appealStatusVariant: Record<AppealStatus, 'warning' | 'success' | 'danger'> = {
  [AppealStatus.OPEN]: 'warning',
  [AppealStatus.RESOLVED]: 'success',
  [AppealStatus.REJECTED]: 'danger',
};

const APPEALS_PAGE_SIZE = 20;

export default function AppealsPage() {
  const queryClient = useQueryClient();
  const [listTab, setListTab] = useState<'current' | 'history'>('current');
  const [currentPage, setCurrentPage] = useState(1);
  const [historyPage, setHistoryPage] = useState(1);
  const [selectedAppeal, setSelectedAppeal] = useState<AppealDto | null>(null);
  const [viewingProof, setViewingProof] = useState<string | null>(null);

  const { data: currentData, isLoading: currentLoading } = useQuery({
    queryKey: traderKeys.appealsQuery('current', currentPage, APPEALS_PAGE_SIZE),
    queryFn: () =>
      api.get<AppealsListResponse>(internalPaths.appeals, {
        listBucket: 'current',
        page: String(currentPage),
        limit: String(APPEALS_PAGE_SIZE),
      }),
  });

  const { data: historyData, isLoading: historyLoading } = useQuery({
    queryKey: traderKeys.appealsQuery('history', historyPage, APPEALS_PAGE_SIZE),
    queryFn: () =>
      api.get<AppealsListResponse>(internalPaths.appeals, {
        listBucket: 'history',
        page: String(historyPage),
        limit: String(APPEALS_PAGE_SIZE),
      }),
  });

  const activeBucket = listTab === 'current' ? currentData : historyData;
  const activeLoading = listTab === 'current' ? currentLoading : historyLoading;
  const activePage = listTab === 'current' ? currentPage : historyPage;
  const setActivePage = listTab === 'current' ? setCurrentPage : setHistoryPage;

  const activeLimit =
    activeBucket?.limit && activeBucket.limit > 0 ? activeBucket.limit : APPEALS_PAGE_SIZE;
  const activeTotalPages = Math.max(1, Math.ceil((activeBucket?.total ?? 0) / activeLimit));

  const currentLimit =
    currentData?.limit && currentData.limit > 0 ? currentData.limit : APPEALS_PAGE_SIZE;
  const currentTotalPages = Math.max(1, Math.ceil((currentData?.total ?? 0) / currentLimit));

  const historyLimit =
    historyData?.limit && historyData.limit > 0 ? historyData.limit : APPEALS_PAGE_SIZE;
  const historyTotalPages = Math.max(1, Math.ceil((historyData?.total ?? 0) / historyLimit));

  useEffect(() => {
    if (currentPage > currentTotalPages) setCurrentPage(currentTotalPages);
  }, [currentPage, currentTotalPages]);

  useEffect(() => {
    if (historyPage > historyTotalPages) setHistoryPage(historyTotalPages);
  }, [historyPage, historyTotalPages]);

  const resolveAppeal = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: AppealStatus }) =>
      api.patch<AppealDto>(internalPaths.appealResolve(id), { decision }),
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({ queryKey: traderKeys.appealsScope });
      setSelectedAppeal((prev) => (prev?.id === updated.id ? updated : prev));
    },
  });

  useEffect(() => {
    if (!selectedAppeal) return;
    const rows = [...(currentData?.items ?? []), ...(historyData?.items ?? [])];
    const fresh = rows.find((a) => a.id === selectedAppeal.id);
    if (fresh) setSelectedAppeal(fresh);
  }, [currentData?.items, historyData?.items, selectedAppeal?.id]);

  const listData =
    listTab === 'current' ? (currentData?.items ?? []) : (historyData?.items ?? []);

  const columns = [
    {
      key: 'id',
      header: 'Appeal ID',
      className: 'font-mono tabular-nums text-end',
      render: (row: AppealDto) => (
        <span className="font-mono text-xs text-text-muted">{shortId(row.id)}</span>
      ),
    },
    {
      key: 'payin_order_id',
      header: 'Pay-In order',
      className: 'font-mono tabular-nums text-end',
      render: (row: AppealDto) => (
        <span className="font-mono text-xs text-text-muted" title={row.payin_order_id}>
          {shortId(row.payin_order_id)}
        </span>
      ),
    },
    {
      key: 'order_amount',
      header: 'Order amount',
      className: 'text-end tabular-nums',
      render: (row: AppealDto) => (
        <span className="text-text-primary">
          {formatCurrency(row.order_amount, row.currency)}
        </span>
      ),
    },
    {
      key: 'paid_amount',
      header: 'Paid (reported)',
      className: 'text-end tabular-nums',
      render: (row: AppealDto) => (
        <span className="font-medium">
          {formatCurrency(row.paid_amount, row.currency)}
        </span>
      ),
    },
    {
      key: 'requisite',
      header: 'Requisite',
      render: (row: AppealDto) => (
        <div className="max-w-[14rem] truncate text-sm text-text-primary" title={requisiteLabel(row)}>
          {requisiteShort(row)}
        </div>
      ),
    },
    {
      key: 'requisite_owner',
      header: 'Owner',
      render: (row: AppealDto) => (
        <span className="max-w-[10rem] truncate text-sm text-text-muted" title={row.requisite_owner}>
          {row.requisite_owner || '—'}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      className: 'text-center',
      render: (row: AppealDto) => (
        <Badge variant={appealStatusVariant[row.status]} dot>
          {row.status}
        </Badge>
      ),
    },
    {
      key: 'proofs',
      header: 'Proofs',
      className: 'text-end tabular-nums',
      render: (row: AppealDto) => (
        <span className="text-text-muted text-sm">
          {row.proofs_of_payment.length} file{row.proofs_of_payment.length !== 1 ? 's' : ''}
        </span>
      ),
    },
    {
      key: 'created_at',
      header: 'Created',
      render: (row: AppealDto) => (
        <span className="text-text-muted text-sm">{formatDate(row.created_at)}</span>
      ),
    },
    {
      key: 'actions',
      header: '',
      className: 'text-end w-12',
      render: (row: AppealDto) => (
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <IconButton label="View appeal details" onClick={() => setSelectedAppeal(row)}>
            <Eye className="h-4 w-4" />
          </IconButton>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-3">
          <AlertTriangle className="h-6 w-6 text-accent-yellow" />
          <div>
            <h1 className="text-2xl font-bold text-text-primary">Appeals</h1>
            <p className="text-sm text-text-muted">
              {listTab === 'current'
                ? 'Open appeals on your assigned orders: review payer proof files and resolve or reject. Support and administrators can intervene when needed.'
                : 'Completed appeals on your orders: accepted (resolved) or rejected (cancelled).'}{' '}
              <span className="text-text-secondary">
                {(activeBucket?.total ?? listData.length) === 1
                  ? `${activeBucket?.total ?? listData.length} appeal`
                  : `${activeBucket?.total ?? listData.length} appeals`}{' '}
                ({listData.length} on this page)
              </span>
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 sm:justify-end">
          <Tabs
            tabs={[
              { key: 'current', label: 'Current' },
              { key: 'history', label: 'History' },
            ]}
            active={listTab}
            onChange={(k) => setListTab(k as 'current' | 'history')}
          />
        </div>
      </div>

      <Table
        columns={columns}
        data={listData}
        keyExtractor={(row) => row.id}
        loading={activeLoading}
        onRowClick={(row) => setSelectedAppeal(row)}
        emptyMessage={listTab === 'current' ? 'No open appeals' : 'No completed appeals yet'}
      />

      {activeTotalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-text-muted">
          <span>
            Page {activePage} of {activeTotalPages} ({activeBucket?.total ?? 0} appeals)
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              className="rounded bg-bg-secondary px-3 py-1 disabled:opacity-40"
              onClick={() => setActivePage((p) => Math.max(1, p - 1))}
              disabled={activePage <= 1}
            >
              ← Previous
            </button>
            <button
              type="button"
              className="rounded bg-bg-secondary px-3 py-1 disabled:opacity-40"
              onClick={() =>
                setActivePage((p) => Math.min(activeTotalPages, p + 1))
              }
              disabled={activePage >= activeTotalPages}
            >
              Next →
            </button>
          </div>
        </div>
      )}

      <Modal
        open={!!selectedAppeal}
        onClose={() => setSelectedAppeal(null)}
        title="Appeal Details"
        size="lg"
      >
        {selectedAppeal && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <DetailRow label="Appeal ID" value={selectedAppeal.id} mono />
              <DetailRow label="Pay-In order ID" value={selectedAppeal.payin_order_id} mono />
              <DetailRow label="Created" value={formatDateFull(selectedAppeal.created_at)} />
              <DetailRow
                label="Order amount"
                value={formatCurrency(selectedAppeal.order_amount, selectedAppeal.currency)}
              />
              <DetailRow
                label="Paid amount (reported by payer)"
                value={formatCurrency(selectedAppeal.paid_amount, selectedAppeal.currency)}
              />
              <DetailRow label="Bank" value={selectedAppeal.bank || '—'} />
              <DetailRow label="Requisite (number)" value={selectedAppeal.requisite_number || '—'} mono />
              <DetailRow label="Card / account owner" value={selectedAppeal.requisite_owner || '—'} />
              <DetailRow label="Status">
                <Badge variant={appealStatusVariant[selectedAppeal.status]} dot>
                  {selectedAppeal.status}
                </Badge>
              </DetailRow>
            </div>

            {selectedAppeal.proofs_of_payment.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-text-secondary">Proof files</h3>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  {selectedAppeal.proofs_of_payment.map((fileId) => (
                    <button
                      key={fileId}
                      type="button"
                      onClick={() => setViewingProof(fileId)}
                      className="group relative cursor-pointer overflow-hidden rounded-lg border border-border-primary bg-bg-secondary text-left transition-colors hover:border-accent-blue"
                    >
                      <div className="pointer-events-none aspect-video max-h-36">
                        <AuthorizedFilePreview
                          path={internalPaths.fileById(fileId)}
                          alt="Proof of payment"
                          className="h-full max-h-36"
                        />
                      </div>
                      <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/40">
                        <ExternalLink className="h-5 w-5 text-white opacity-0 transition-opacity group-hover:opacity-100" />
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {selectedAppeal.status === AppealStatus.OPEN && (
              <div className="flex flex-wrap gap-2 border-t border-border-primary pt-4">
                <Button
                  variant="secondary"
                  size="sm"
                  loading={resolveAppeal.isPending}
                  onClick={() =>
                    resolveAppeal.mutate({
                      id: selectedAppeal.id,
                      decision: AppealStatus.REJECTED,
                    })
                  }
                >
                  Reject appeal
                </Button>
                <Button
                  size="sm"
                  loading={resolveAppeal.isPending}
                  onClick={() =>
                    resolveAppeal.mutate({
                      id: selectedAppeal.id,
                      decision: AppealStatus.RESOLVED,
                    })
                  }
                >
                  Accept (resolved)
                </Button>
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal
        open={!!viewingProof}
        onClose={() => setViewingProof(null)}
        title="Proof of Payment"
        size="xl"
      >
        {viewingProof && (
          <div className="flex min-h-[40vh] items-center justify-center">
            <AuthorizedFilePreview
              path={internalPaths.fileById(viewingProof)}
              alt="Proof of payment"
              className="max-h-[75vh]"
            />
          </div>
        )}
      </Modal>
    </div>
  );
}

function requisiteShort(row: AppealDto): string {
  const parts = [row.requisite_number, row.bank].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : '—';
}

function requisiteLabel(row: AppealDto): string {
  return requisiteShort(row);
}

function DetailRow({
  label,
  value,
  mono,
  children,
}: {
  label: string;
  value?: string;
  mono?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-text-muted">{label}</span>
      {children ?? (
        <span className={cn('text-sm text-text-primary', mono && 'font-mono text-xs')}>
          {value}
        </span>
      )}
    </div>
  );
}
