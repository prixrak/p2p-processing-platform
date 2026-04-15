'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle, XCircle, Eye } from 'lucide-react';
import { api } from '@/lib/api';
import { internalPaths } from '@/lib/internal-api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import { Tabs } from '@/components/ui/tabs';
import { DataTable } from '@/components/ui/data-table';

interface Settlement {
  id: string;
  type: 'MERCHANT' | 'TRADER';
  entityName: string;
  amount: number;
  currency: string;
  status: string;
  createdAt: string;
}

interface SettlementsResponse {
  data: Settlement[];
  total: number;
  page: number;
  totalPages: number;
}

interface SettlementDetails {
  id: string;
  type: string;
  entityName: string;
  amount: number;
  currency: string;
  status: string;
  createdAt: string;
  processedAt: string | null;
  requisites: { bank: string; account: string } | null;
  notes: string | null;
}

const statusColor: Record<string, 'green' | 'yellow' | 'red' | 'blue' | 'default'> = {
  COMPLETED: 'green',
  PENDING: 'yellow',
  PROCESSING: 'blue',
  REJECTED: 'red',
};

export default function SettlementsPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState('PENDING');
  const [page, setPage] = useState(1);
  const [detailId, setDetailId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['owner', 'settlements', tab, page],
    queryFn: () => {
      const params = new URLSearchParams({ status: tab, page: String(page), limit: '20' });
      return api.get<SettlementsResponse>(`${internalPaths.settlements}?${params}`);
    },
  });

  const { data: details } = useQuery({
    queryKey: ['owner', 'settlement-details', detailId],
    queryFn: () =>
      api.get<SettlementDetails>(
        internalPaths.notImplemented.settlement(detailId!),
      ),
    enabled: !!detailId,
  });

  const processSettlement = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'approve' | 'reject' }) =>
      api.post(internalPaths.notImplemented.settlementAction(id, action)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['owner', 'settlements'] });
      queryClient.invalidateQueries({ queryKey: ['owner', 'settlement-details'] });
    },
  });

  const columns = [
    {
      key: 'id',
      header: 'Settlement ID',
      render: (s: Settlement) => (
        <span className="font-mono text-sm text-text-primary">{s.id.slice(0, 12)}</span>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      render: (s: Settlement) => (
        <Badge color={s.type === 'MERCHANT' ? 'blue' : 'green'}>{s.type}</Badge>
      ),
    },
    {
      key: 'entity',
      header: 'Entity',
      render: (s: Settlement) => (
        <span className="text-sm text-text-secondary">{s.entityName}</span>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      render: (s: Settlement) => (
        <span className="font-mono text-sm font-medium text-text-primary">
          {s.amount.toLocaleString()} {s.currency}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (s: Settlement) => (
        <Badge color={statusColor[s.status] ?? 'default'}>{s.status}</Badge>
      ),
    },
    {
      key: 'date',
      header: 'Created',
      render: (s: Settlement) => (
        <span className="text-sm text-text-muted">
          {new Date(s.createdAt).toLocaleString()}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (s: Settlement) => (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => setDetailId(s.id)} title="View">
            <Eye className="h-3.5 w-3.5" />
          </Button>
          {s.status === 'PENDING' && (
            <>
              <Button
                variant="success"
                size="sm"
                onClick={() => processSettlement.mutate({ id: s.id, action: 'approve' })}
                title="Approve"
              >
                <CheckCircle className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={() => processSettlement.mutate({ id: s.id, action: 'reject' })}
                title="Reject"
              >
                <XCircle className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Settlements</h1>
        <p className="mt-1 text-sm text-text-muted">Review and process settlement requests</p>
      </div>

      <Tabs
        tabs={[
          { key: 'PENDING', label: 'Pending' },
          { key: 'PROCESSING', label: 'Processing' },
          { key: 'COMPLETED', label: 'Completed' },
          { key: 'REJECTED', label: 'Rejected' },
        ]}
        active={tab}
        onChange={(k) => { setTab(k); setPage(1); }}
      />

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        isLoading={isLoading}
        page={page}
        totalPages={data?.totalPages}
        onPageChange={setPage}
        emptyMessage="No settlements found"
      />

      <Modal
        open={!!detailId}
        onClose={() => setDetailId(null)}
        title={`Settlement — ${detailId?.slice(0, 12) ?? ''}`}
      >
        {details && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-text-muted">Type</p>
                <p className="font-medium text-text-primary">{details.type}</p>
              </div>
              <div>
                <p className="text-xs text-text-muted">Status</p>
                <Badge color={statusColor[details.status] ?? 'default'}>{details.status}</Badge>
              </div>
              <div>
                <p className="text-xs text-text-muted">Entity</p>
                <p className="text-sm text-text-primary">{details.entityName}</p>
              </div>
              <div>
                <p className="text-xs text-text-muted">Amount</p>
                <p className="font-mono font-medium text-text-primary">
                  {details.amount.toLocaleString()} {details.currency}
                </p>
              </div>
            </div>

            {details.requisites && (
              <div className="rounded-lg border border-border-primary bg-surface-primary p-3">
                <p className="mb-1 text-xs text-text-muted">Requisites</p>
                <p className="text-sm text-text-primary">{details.requisites.bank}</p>
                <p className="font-mono text-sm text-text-secondary">{details.requisites.account}</p>
              </div>
            )}

            {details.notes && (
              <div className="rounded-lg border border-border-primary bg-surface-primary p-3">
                <p className="mb-1 text-xs text-text-muted">Notes</p>
                <p className="text-sm text-text-secondary">{details.notes}</p>
              </div>
            )}

            {details.status === 'PENDING' && (
              <div className="flex justify-end gap-3 pt-2">
                <Button
                  variant="danger"
                  onClick={() => processSettlement.mutate({ id: details.id, action: 'reject' })}
                  loading={processSettlement.isPending}
                >
                  Reject
                </Button>
                <Button
                  variant="success"
                  onClick={() => processSettlement.mutate({ id: details.id, action: 'approve' })}
                  loading={processSettlement.isPending}
                >
                  Approve
                </Button>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
