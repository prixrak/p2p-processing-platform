'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDebouncedTextFilter } from '@/lib/hooks/use-debounced-value';
import { FilterInput } from '@/components/ui/filters';
import { DEFAULT_LIST_PAGE_SIZE, type ListPageSize } from '@/lib/list-pagination';
import { listSearchForQuery } from '@/lib/list-search';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { AlertTriangle, ExternalLink, Eye, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ListPageRefreshButton } from '@/components/ui/list-page-tools';
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
import { AppealDecisionConfirmDialog } from '@/components/appeals/appeal-decision-confirm-dialog';
import type { PendingAppealDecision } from '@/lib/appeal-decision-confirm';

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

const APPEALS_PAGE_SIZE = DEFAULT_LIST_PAGE_SIZE;

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
  const tCommon = useTranslations('Trader.Common');
  const queryClient = useQueryClient();
  const [listTab, setListTab] = useState<'current' | 'history'>('current');
  const [currentPage, setCurrentPage] = useState(1);
  const [historyPage, setHistoryPage] = useState(1);
  const [pageSize, setPageSize] = useState<ListPageSize>(APPEALS_PAGE_SIZE);
  const {
    value: searchInput,
    setValue: setSearchInput,
    debounced: debouncedSearch,
  } = useDebouncedTextFilter();
  const [selectedAppeal, setSelectedAppeal] = useState<AppealDto | null>(null);
  const [viewingProof, setViewingProof] = useState<string | null>(null);
  const [proofGalleryAppeal, setProofGalleryAppeal] = useState<AppealDto | null>(null);
  const [pendingAppealDecision, setPendingAppealDecision] =
    useState<PendingAppealDecision | null>(null);

  const appealConfirmLabels = useMemo(
    () => ({
      title: t('confirmTitle'),
      rejectDescription: t('confirmRejectDescription'),
      acceptDescription: t('confirmAcceptDescription'),
      rejectLabel: t('confirmRejectLabel'),
      acceptLabel: t('confirmAcceptLabel'),
      cancelLabel: t('confirmCancel'),
    }),
    [t],
  );

  const appealAmountLabels = useMemo(
    () => ({
      label: t('confirmAmountLabel'),
      hint: t('confirmAmountHint'),
    }),
    [t],
  );

  const openAppealDecision = useCallback((appeal: AppealDto, decision: AppealStatus) => {
    setPendingAppealDecision({
      appealId: appeal.id,
      decision,
      orderAmount: appeal.order_amount,
      defaultPaidAmount:
        decision === AppealStatus.RESOLVED ? appeal.paid_amount : undefined,
    });
  }, []);

  /** Load the inactive bucket only while a detail modal is open so resolve/sync still sees fresh rows. */
  const prefetchForOpenModal = !!selectedAppeal;
  const searchParam = listSearchForQuery(debouncedSearch);

  const currentQueryKey = traderKeys.appealsQuery('current', currentPage, pageSize, searchParam);
  const historyQueryKey = traderKeys.appealsQuery('history', historyPage, pageSize, searchParam);

  const { data: currentData, isLoading: currentLoading, isFetching: currentFetching } = useQuery({
    queryKey: currentQueryKey,
    queryFn: () =>
      api.get<AppealsListResponse>(internalPaths.appeals, {
        listBucket: 'current',
        page: String(currentPage),
        limit: String(pageSize),
        ...(searchParam ? { search: searchParam } : {}),
      }),
    enabled: listTab === 'current' || prefetchForOpenModal,
  });

  const { data: historyData, isLoading: historyLoading, isFetching: historyFetching } = useQuery({
    queryKey: historyQueryKey,
    queryFn: () =>
      api.get<AppealsListResponse>(internalPaths.appeals, {
        listBucket: 'history',
        page: String(historyPage),
        limit: String(pageSize),
        ...(searchParam ? { search: searchParam } : {}),
      }),
    enabled: listTab === 'history' || prefetchForOpenModal,
  });

  useEffect(() => {
    setCurrentPage(1);
    setHistoryPage(1);
  }, [searchParam, listTab, pageSize]);

  const activeBucket = listTab === 'current' ? currentData : historyData;
  const activeLoading = listTab === 'current' ? currentLoading : historyLoading;
  const activePage = listTab === 'current' ? currentPage : historyPage;
  const setActivePage = listTab === 'current' ? setCurrentPage : setHistoryPage;

  const activeLimit =
    activeBucket?.limit && activeBucket.limit > 0 ? activeBucket.limit : pageSize;
  const activeTotalPages = Math.max(1, Math.ceil((activeBucket?.total ?? 0) / activeLimit));

  const currentLimit =
    currentData?.limit && currentData.limit > 0 ? currentData.limit : pageSize;
  const currentTotalPages = Math.max(1, Math.ceil((currentData?.total ?? 0) / currentLimit));

  const historyLimit =
    historyData?.limit && historyData.limit > 0 ? historyData.limit : pageSize;
  const historyTotalPages = Math.max(1, Math.ceil((historyData?.total ?? 0) / historyLimit));

  useEffect(() => {
    if (currentPage > currentTotalPages) setCurrentPage(currentTotalPages);
  }, [currentPage, currentTotalPages]);

  useEffect(() => {
    if (historyPage > historyTotalPages) setHistoryPage(historyTotalPages);
  }, [historyPage, historyTotalPages]);

  const resolveAppeal = useMutation({
    mutationFn: ({
      id,
      decision,
      actualAmount,
    }: {
      id: string;
      decision: AppealStatus;
      actualAmount?: number;
    }) =>
      api.patch<AppealDto>(internalPaths.appealResolve(id), {
        decision,
        ...(actualAmount !== undefined ? { actualAmount } : {}),
      }),
    onSuccess: (updated) => {
      setPendingAppealDecision(null);
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

  const columns = useMemo(() => {
    const base = [
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
              requisite_card_holder_name: row.requisite_card_holder_name,
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
        className: 'w-12 text-center',
        render: (row: AppealDto) => {
          const proofCount = row.proofs_of_payment.length;
          if (proofCount === 0) {
            return <span className="text-sm text-text-muted">{t('dash')}</span>;
          }
          return (
            <div className="flex justify-center" onClick={(e) => e.stopPropagation()}>
              <IconButton
                label={t('proofViewLabel', { count: proofCount })}
                tooltipWide
                variant="ghost"
                className="!min-h-8 !min-w-8 shrink-0 !p-1.5 text-text-primary hover:bg-bg-hover"
                onClick={() => setProofGalleryAppeal(row)}
              >
                <FileText className="h-4 w-4" strokeWidth={2} />
              </IconButton>
            </div>
          );
        },
      },
      {
        key: 'created_at',
        header: t('colCreated'),
        render: (row: AppealDto) => (
          <span className="text-text-muted text-sm">{formatDate(row.created_at)}</span>
        ),
      },
    ];

    if (listTab === 'current') {
      base.push({
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
      });
    }

    return base;
  }, [t, listTab]);

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
          <ListPageRefreshButton
            isRefreshing={listTab === 'current' ? currentFetching : historyFetching}
            onRefresh={() =>
              queryClient.invalidateQueries({ queryKey: traderKeys.appealsScope })
            }
          />
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

      <FilterInput
        label={t('searchLabel')}
        value={searchInput}
        onChange={setSearchInput}
        placeholder={t('searchPlaceholder')}
        className="max-w-2xl"
      />

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
        pageSize={pageSize}
        onPageSizeChange={setPageSize}
        rowsPerPageLabel={tCommon('rowsPerPage')}
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
              <DetailRow
                label={t('cardHolderName')}
                value={selectedAppeal.requisite_card_holder_name || t('dash')}
              />
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
                  onClick={() => openAppealDecision(selectedAppeal, AppealStatus.REJECTED)}
                >
                  {t('rejectAppeal')}
                </Button>
                <Button
                  size="sm"
                  loading={resolveAppeal.isPending}
                  onClick={() => openAppealDecision(selectedAppeal, AppealStatus.RESOLVED)}
                >
                  {t('acceptResolved')}
                </Button>
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal
        open={!!proofGalleryAppeal}
        onClose={() => setProofGalleryAppeal(null)}
        title={t('proofGalleryTitle')}
        size="lg"
      >
        {proofGalleryAppeal && proofGalleryAppeal.proofs_of_payment.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs text-text-muted">
              {t('colAppealId')}{' '}
              <span className="break-all font-mono text-xs text-text-secondary">
                {proofGalleryAppeal.id}
              </span>
            </p>
            <div className="grid grid-cols-3 gap-3">
              {proofGalleryAppeal.proofs_of_payment.map((fileId) => (
                <button
                  key={fileId}
                  type="button"
                  onClick={() => setViewingProof(fileId)}
                  className="group relative cursor-pointer overflow-hidden rounded-lg border border-border-primary bg-bg-secondary transition-colors hover:border-accent-blue"
                >
                  <div className="pointer-events-none aspect-video max-h-36">
                    <AuthorizedFilePreview
                      path={internalPaths.fileById(fileId)}
                      alt={t('proofAlt')}
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

      <AppealDecisionConfirmDialog
        pending={pendingAppealDecision}
        onOpenChange={(open) => !open && setPendingAppealDecision(null)}
        labels={appealConfirmLabels}
        amountLabels={appealAmountLabels}
        loading={resolveAppeal.isPending}
        onConfirm={({ appealId, decision, actualAmount }) =>
          resolveAppeal.mutate({ id: appealId, decision, actualAmount })
        }
      />
    </div>
  );
}
