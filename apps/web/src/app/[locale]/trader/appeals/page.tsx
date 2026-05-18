'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { AlertTriangle, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Badge } from '@/components/ui/badge';
import { Table } from '@/components/ui/table';
import { Tabs } from '@/components/ui/tabs';
import { Modal } from '@/components/ui/modal';
import { DetailRow } from '@/components/ui/detail-row';
import { ProofThumbnailGrid } from '@/components/ui/proof-thumbnail-grid';
import { PaginationControls } from '@/components/ui/pagination-controls';
import { api } from '@/lib/api';
import { internalPaths } from '@/lib/internal-api';
import { traderKeys } from '@/lib/query-keys';
import { AuthorizedFilePreview } from '@/components/files/authorized-file-preview';
import { OrderIdCopyCell } from '@/components/ui/order-id-copy-cell';
import { PayinRequisiteTableCell } from '@/components/ui/payin-requisite-table-cell';
import { formatCurrency, formatDate, formatDateFull } from '@/lib/utils';
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

function appealStatusLabel(
  t: (key: 'appealStatuses.OPEN' | 'appealStatuses.RESOLVED' | 'appealStatuses.REJECTED') => string,
  status: AppealStatus,
) {
  switch (status) {
    case AppealStatus.OPEN:
      return t('appealStatuses.OPEN');
    case AppealStatus.RESOLVED:
      return t('appealStatuses.RESOLVED');
    case AppealStatus.REJECTED:
      return t('appealStatuses.REJECTED');
    default:
      return status;
  }
}

export default function AppealsPage() {
  const t = useTranslations('Trader.Appeals');
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
      void queryClient.invalidateQueries({ queryKey: traderKeys.payinOrdersScope });
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

  const columns = useMemo(
    () => [
      {
        key: 'id',
        header: t('colAppealId'),
        className: 'font-mono tabular-nums text-end',
        render: (row: AppealDto) => (
          <OrderIdCopyCell id={row.id} withToast label={t('colAppealId')} />
        ),
      },
      {
        key: 'payin_order_id',
        header: t('colPayinOrder'),
        className: 'font-mono tabular-nums text-end',
        render: (row: AppealDto) => (
          <OrderIdCopyCell id={row.payin_order_id} withToast label={t('modalPayinId')} />
        ),
      },
      {
        key: 'requisite',
        header: t('colRequisite'),
        className: 'min-w-[7rem]',
        render: (row: AppealDto) => (
          <PayinRequisiteTableCell
            row={{
              requisite_number: row.requisite_number,
              requisite_owner: row.requisite_owner,
              bank: row.bank,
            }}
          />
        ),
      },
      {
        key: 'order_amount',
        header: t('colOrderAmount'),
        className: 'text-end tabular-nums',
        render: (row: AppealDto) => (
          <span className="text-text-primary">{formatCurrency(row.order_amount, row.currency)}</span>
        ),
      },
      {
        key: 'paid_amount',
        header: t('colPaidReported'),
        className: 'text-end tabular-nums',
        render: (row: AppealDto) => (
          <span className="font-medium">{formatCurrency(row.paid_amount, row.currency)}</span>
        ),
      },
      {
        key: 'requisite_owner',
        header: t('colOwner'),
        render: (row: AppealDto) => (
          <span className="max-w-[10rem] truncate text-sm text-text-muted" title={row.requisite_owner}>
            {row.requisite_owner || t('dash')}
          </span>
        ),
      },
      {
        key: 'status',
        header: t('colStatus'),
        className: 'text-center',
        render: (row: AppealDto) => (
          <Badge variant={appealStatusVariant[row.status]} dot>
            {appealStatusLabel(t, row.status)}
          </Badge>
        ),
      },
      {
        key: 'proofs',
        header: t('colProofs'),
        className: 'text-end tabular-nums',
        render: (row: AppealDto) => (
          <span className="text-text-muted text-sm">
            {t('proofFiles', { count: row.proofs_of_payment.length })}
          </span>
        ),
      },
      {
        key: 'created_at',
        header: t('colCreated'),
        render: (row: AppealDto) => (
          <span className="text-text-muted text-sm">{formatDate(row.created_at)}</span>
        ),
      },
      {
        key: 'actions',
        header: t('colActions'),
        className: 'text-end w-12',
        render: (row: AppealDto) => (
          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            <IconButton label={t('viewDetails')} onClick={() => setSelectedAppeal(row)}>
              <Eye className="h-4 w-4" />
            </IconButton>
          </div>
        ),
      },
    ],
    [t],
  );

  const totalCount = activeBucket?.total ?? listData.length;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-3">
          <AlertTriangle className="h-6 w-6 text-accent-yellow" />
          <div>
            <h1 className="text-2xl font-bold text-text-primary">{t('title')}</h1>
            <p className="text-sm text-text-muted">
              {listTab === 'current' ? t('subtitleCurrent') : t('subtitleHistory')}{' '}
              <span className="text-text-secondary">
                {t('countLine', { total: totalCount, pageCount: listData.length })}
              </span>
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 sm:justify-end">
          <Tabs
            tabs={[
              { key: 'current', label: t('tabCurrent') },
              { key: 'history', label: t('tabHistory') },
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
        emptyMessage={listTab === 'current' ? t('emptyCurrent') : t('emptyHistory')}
      />

      <PaginationControls
        page={activePage}
        totalPages={activeTotalPages}
        onPageChange={setActivePage}
        totalItems={activeBucket?.total ?? 0}
        itemLabel={t('itemLabel')}
        variant="minimal"
      />

      <Modal
        open={!!selectedAppeal}
        onClose={() => setSelectedAppeal(null)}
        title={t('modalTitle')}
        size="lg"
      >
        {selectedAppeal && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <DetailRow label={t('colAppealId')} value={selectedAppeal.id} mono />
              <DetailRow label={t('modalPayinId')} value={selectedAppeal.payin_order_id} mono />
              <DetailRow label={t('colCreated')} value={formatDateFull(selectedAppeal.created_at)} />
              <DetailRow
                label={t('colOrderAmount')}
                value={formatCurrency(selectedAppeal.order_amount, selectedAppeal.currency)}
              />
              <DetailRow
                label={t('paidReportedLabel')}
                value={formatCurrency(selectedAppeal.paid_amount, selectedAppeal.currency)}
              />
              <DetailRow label={t('modalBank')} value={selectedAppeal.bank || t('dash')} />
              <DetailRow label={t('requisiteNumber')} value={selectedAppeal.requisite_number || t('dash')} mono />
              <DetailRow label={t('cardOwner')} value={selectedAppeal.requisite_owner || t('dash')} />
              <DetailRow label={t('colStatus')}>
                <Badge variant={appealStatusVariant[selectedAppeal.status]} dot>
                  {appealStatusLabel(t, selectedAppeal.status)}
                </Badge>
              </DetailRow>
            </div>

            {selectedAppeal.proofs_of_payment.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-text-secondary">{t('proofFilesHeading')}</h3>
                <ProofThumbnailGrid
                  fileIds={selectedAppeal.proofs_of_payment}
                  alt={t('proofAlt')}
                  onOpen={setViewingProof}
                  columnsClass="grid-cols-1 sm:grid-cols-3"
                  tileMaxHeightClass="max-h-36"
                />
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
                  {t('rejectAppeal')}
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
                  {t('acceptResolved')}
                </Button>
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal
        open={!!viewingProof}
        onClose={() => setViewingProof(null)}
        title={t('proofModalTitle')}
        size="xl"
      >
        {viewingProof && (
          <div className="flex min-h-[40vh] items-center justify-center">
            <AuthorizedFilePreview
              path={internalPaths.fileById(viewingProof)}
              alt={t('proofAlt')}
              className="max-h-[75vh]"
            />
          </div>
        )}
      </Modal>
    </div>
  );
}
