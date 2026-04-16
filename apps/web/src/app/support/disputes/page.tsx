'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Eye, FileImage, MessageSquare } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import { Textarea } from '@/components/ui/textarea';
import { Tabs } from '@/components/ui/tabs';
import { DataTable } from '@/components/ui/data-table';

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
  const [search, setSearch] = useState('');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [note, setNote] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['support', 'disputes', tab, page, search],
    queryFn: () => {
      const params = new URLSearchParams({
        status: tab,
        page: String(page),
        limit: '20',
      });
      if (search) params.set('search', search);
      return api.get<DisputesResponse>(`/api/support/disputes?${params}`);
    },
  });

  const { data: details } = useQuery({
    queryKey: ['support', 'dispute-details', detailId],
    queryFn: () => api.get<DisputeDetails>(`/api/support/disputes/${detailId}`),
    enabled: !!detailId,
  });

  const addNote = useMutation({
    mutationFn: ({ id, content }: { id: string; content: string }) =>
      api.post(`/api/support/disputes/${id}/notes`, { content }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['support', 'dispute-details', detailId] });
      setNote('');
    },
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.patch(`/api/support/disputes/${id}`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['support', 'disputes'] });
      queryClient.invalidateQueries({ queryKey: ['support', 'dispute-details', detailId] });
    },
  });

  const columns = [
    {
      key: 'order',
      header: 'Order',
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
      render: (d: Dispute) => (
        <Badge color={statusColor[d.status] ?? 'default'}>{d.status}</Badge>
      ),
    },
    {
      key: 'date',
      header: 'Created',
      render: (d: Dispute) => (
        <span className="text-sm text-text-muted">
          {new Date(d.createdAt).toLocaleString()}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      className: 'w-12',
      render: (d: Dispute) => (
        <IconButton label="View dispute details" onClick={() => setDetailId(d.id)}>
          <Eye className="h-3.5 w-3.5" />
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

      <Input
        placeholder="Search by order ID or merchant..."
        value={search}
        onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        className="w-72"
      />

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
                <h4 className="mb-2 text-sm font-medium text-text-secondary">Proof Files</h4>
                <div className="flex flex-wrap gap-2">
                  {details.proofFiles.map((f) => (
                    <a
                      key={f.id}
                      href={f.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 rounded-lg border border-border-primary bg-surface-primary px-3 py-2 text-sm text-accent transition-colors hover:bg-surface-tertiary"
                    >
                      <FileImage className="h-4 w-4" />
                      {f.name}
                    </a>
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
                          {new Date(n.createdAt).toLocaleString()}
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
                      onClick={() => updateStatus.mutate({ id: details.id, status: 'IN_PROGRESS' })}
                    >
                      Mark In Progress
                    </Button>
                  )}
                  {(details.status === 'OPEN' || details.status === 'IN_PROGRESS') && (
                    <Button
                      variant="success"
                      size="sm"
                      onClick={() => updateStatus.mutate({ id: details.id, status: 'RESOLVED' })}
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
                  <MessageSquare className="h-3.5 w-3.5" /> Add Note
                </Button>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
