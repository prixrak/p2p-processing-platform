'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useDebouncedTextFilter } from '@/lib/hooks/use-debounced-value';
import { Eye, FileImage, MessageSquare } from 'lucide-react';
import { api } from '@/lib/api';
import { internalPaths } from '@/lib/internal-api';
import { supportKeys } from '@/lib/query-keys';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { FilterBar, FilterInput } from '@/components/ui/filters';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import { Textarea } from '@/components/ui/textarea';
import { Tabs } from '@/components/ui/tabs';
import { DataTable } from '@/components/ui/data-table';
import { PendingConfirmDialog } from '@/components/ui/pending-confirm-dialog';
import {
  disputeStatusConfirmCopy,
  type PendingDisputeStatusChange,
} from '@/lib/dispute-status-confirm';
import { formatDateTime } from '@/lib/utils';

interface Dispute {
  id: string;
  orderId: string;
  orderType: string;
  merchantName: string;
  traderName: string;
  amount: number;
  currency: string;
  reason: string;
  status: string;
  createdAt: string;
}

interface DisputesResponse {
  data: Dispute[];
  total: number;
  page: number;
  totalPages: number;
}

interface DisputeDetails {
  id: string;
  orderId: string;
  orderType: string;
  merchantName: string;
  traderName: string;
  amount: number;
  currency: string;
  reason: string;
  status: string;
  createdAt: string;
  proofFiles: { id: string; name: string; url: string }[];
  notes: { id: string; author: string; content: string; createdAt: string }[];
}

const statusColor: Record<string, 'green' | 'yellow' | 'red' | 'blue' | 'default'> = {
  OPEN: 'red',
  IN_PROGRESS: 'yellow',
  RESOLVED: 'green',
  CLOSED: 'default',
};

export default function DisputesPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState('OPEN');
  const [page, setPage] = useState(1);
  const {
    value: searchInput,
    setValue: setSearchInput,
    debounced: debouncedSearch,
  } = useDebouncedTextFilter();
  const [detailId, setDetailId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [pendingStatusChange, setPendingStatusChange] =
    useState<PendingDisputeStatusChange | null>(null);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, tab]);

  const { data, isLoading } = useQuery({
    queryKey: supportKeys.disputes(tab, page, debouncedSearch),
    queryFn: () => {
      const params = new URLSearchParams({
        status: tab,
        page: String(page),
        limit: '20',
      });
      if (debouncedSearch) params.set('search', debouncedSearch);
      return api.get<DisputesResponse>(internalPaths.supportDisputes(params.toString()));
    },
  });

  const { data: details } = useQuery({
    queryKey: supportKeys.disputeDetails(detailId),
    queryFn: () => api.get<DisputeDetails>(internalPaths.supportDispute(detailId!)),
    enabled: !!detailId,
  });

  const addNote = useMutation({
    mutationFn: ({ id, content }: { id: string; content: string }) =>
      api.post(internalPaths.supportDisputeNotes(id), { content }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: supportKeys.disputeDetails(detailId) });
      setNote('');
    },
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.patch(internalPaths.supportDispute(id), { status }),
    onSuccess: () => {
      setPendingStatusChange(null);
      queryClient.invalidateQueries({ queryKey: supportKeys.disputesScope });
      queryClient.invalidateQueries({ queryKey: supportKeys.disputeDetails(detailId) });
    },
  });

  const columns = [
    {
      key: 'order',
      header: 'Order',
      className: 'font-mono tabular-nums',
      render: (d: Dispute) => (
        <div>
          <p className="font-mono text-sm text-text-primary">{d.orderId.slice(0, 12)}</p>
          <p className="text-xs text-text-muted">{d.orderType}</p>
        </div>
      ),
    },
    {
      key: 'merchant',
      header: 'Merchant',
      render: (d: Dispute) => (
        <span className="text-sm text-text-secondary">{d.merchantName}</span>
      ),
    },
    {
      key: 'trader',
      header: 'Trader',
      render: (d: Dispute) => (
        <span className="text-sm text-text-secondary">{d.traderName || '—'}</span>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      className: 'text-end tabular-nums',
      render: (d: Dispute) => (
        <span className="font-mono text-sm text-text-primary">
          {d.amount.toLocaleString()} {d.currency}
        </span>
      ),
    },
    {
      key: 'reason',
      header: 'Reason',
      render: (d: Dispute) => (
        <span className="max-w-[200px] truncate text-sm text-text-secondary">{d.reason}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      className: 'text-center',
      render: (d: Dispute) => (
        <Badge color={statusColor[d.status] ?? 'default'}>{d.status}</Badge>
      ),
    },
    {
      key: 'date',
      header: 'Created',
      render: (d: Dispute) => (
        <span className="text-sm text-text-muted">
          {formatDateTime(new Date(d.createdAt))}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      className: 'w-12 text-center',
      render: (d: Dispute) => (
        <IconButton label="View dispute details" onClick={() => setDetailId(d.id)}>
          <Eye className="h-4 w-4" />
        </IconButton>
      ),
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Disputes</h1>
        <p className="mt-1 text-sm text-text-muted">Manage disputed orders and resolve appeals</p>
      </div>

      <Tabs
        tabs={[
          { key: 'OPEN', label: 'Open' },
          { key: 'IN_PROGRESS', label: 'In Progress' },
          { key: 'RESOLVED', label: 'Resolved' },
          { key: 'CLOSED', label: 'Closed' },
        ]}
        active={tab}
        onChange={(k) => { setTab(k); setPage(1); }}
      />

      <FilterBar>
        <FilterInput
          label="Search"
          value={searchInput}
          onChange={setSearchInput}
          placeholder="Search by order ID or merchant..."
          className="w-72 min-w-[12rem]"
        />
      </FilterBar>

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        isLoading={isLoading}
        page={page}
        totalPages={data?.totalPages}
        onPageChange={setPage}
        emptyMessage="No disputes found"
      />

      <Modal
        open={!!detailId}
        onClose={() => setDetailId(null)}
        title={`Dispute — Order ${details?.orderId?.slice(0, 12) ?? ''}`}
        className="max-w-2xl"
      >
        {details && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-text-muted">Status</p>
                <Badge color={statusColor[details.status] ?? 'default'}>{details.status}</Badge>
              </div>
              <div>
                <p className="text-xs text-text-muted">Amount</p>
                <p className="font-mono font-medium text-text-primary">
                  {details.amount.toLocaleString()} {details.currency}
                </p>
              </div>
              <div>
                <p className="text-xs text-text-muted">Merchant</p>
                <p className="text-sm text-text-primary">{details.merchantName}</p>
              </div>
              <div>
                <p className="text-xs text-text-muted">Trader</p>
                <p className="text-sm text-text-primary">{details.traderName || '—'}</p>
              </div>
            </div>

            <div className="rounded-lg border border-border-primary bg-surface-primary p-3">
              <p className="mb-1 text-xs text-text-muted">Reason</p>
              <p className="text-sm text-text-primary">{details.reason}</p>
            </div>

            {details.proofFiles?.length > 0 && (
              <div>
                <h4 className="mb-2 text-sm font-medium text-text-secondary">Proof files</h4>
                <div className="flex flex-wrap gap-2">
                  {details.proofFiles.map((f) => (
                    <Button
                      key={f.id}
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="gap-2 border-border-primary"
                      onClick={() =>
                        void api.getFileSignedUrl(f.id).then(({ url }) => {
                          window.open(url, '_blank', 'noopener,noreferrer');
                        })
                      }
                    >
                      <FileImage className="h-4 w-4" />
                      {f.name}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {details.notes?.length > 0 && (
              <div>
                <h4 className="mb-2 text-sm font-medium text-text-secondary">Notes</h4>
                <div className="space-y-2">
                  {details.notes.map((n) => (
                    <div
                      key={n.id}
                      className="rounded-lg border border-border-primary bg-surface-primary px-3 py-2"
                    >
                      <div className="mb-1 flex items-center justify-between">
                        <span className="text-xs font-medium text-accent">{n.author}</span>
                        <span className="text-xs text-text-muted">
                          {formatDateTime(new Date(n.createdAt))}
                        </span>
                      </div>
                      <p className="text-sm text-text-secondary">{n.content}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-3 border-t border-border-primary pt-4">
              <Textarea
                placeholder="Add a note..."
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              <div className="flex items-center justify-between">
                <div className="flex gap-2">
                  {details.status === 'OPEN' && (
                    <Button
                      variant="secondary"
                      size="sm"
                      loading={
                        updateStatus.isPending &&
                        pendingStatusChange?.id === details.id &&
                        pendingStatusChange.status === 'IN_PROGRESS'
                      }
                      onClick={() =>
                        setPendingStatusChange({
                          id: details.id,
                          status: 'IN_PROGRESS',
                          orderId: details.orderId,
                        })
                      }
                    >
                      Mark In Progress
                    </Button>
                  )}
                  {(details.status === 'OPEN' || details.status === 'IN_PROGRESS') && (
                    <Button
                      variant="success"
                      size="sm"
                      loading={
                        updateStatus.isPending &&
                        pendingStatusChange?.id === details.id &&
                        pendingStatusChange.status === 'RESOLVED'
                      }
                      onClick={() =>
                        setPendingStatusChange({
                          id: details.id,
                          status: 'RESOLVED',
                          orderId: details.orderId,
                        })
                      }
                    >
                      Resolve
                    </Button>
                  )}
                </div>
                <Button
                  size="sm"
                  disabled={!note.trim()}
                  loading={addNote.isPending}
                  onClick={() => addNote.mutate({ id: details.id, content: note })}
                >
                  <MessageSquare className="h-4 w-4" /> Add Note
                </Button>
              </div>
            </div>
          </div>
        )}
      </Modal>

      <PendingConfirmDialog
        pending={pendingStatusChange}
        onOpenChange={(open) => !open && setPendingStatusChange(null)}
        getCopy={disputeStatusConfirmCopy}
        loading={updateStatus.isPending}
        onConfirm={({ id, status }) => updateStatus.mutate({ id, status })}
      />
    </div>
  );
}
