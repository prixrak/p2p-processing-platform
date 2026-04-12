'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  RefreshCw,
  Eye,
  CheckCircle2,
  XCircle,
  ImageIcon,
  FileText,
  ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Table } from '@/components/ui/table';
import { Modal } from '@/components/ui/modal';
import { api } from '@/lib/api';
import { formatCurrency, formatDate, formatDateFull, shortId, cn } from '@/lib/utils';
import { AppealStatus } from '@p2p/shared';

interface AppealOrder {
  id: string;
  order_id: string;
  order_request_id: string;
  appeal_id: string;
  appeal_status: AppealStatus;
  amount: number;
  paid_amount: number;
  currency: string;
  proofs_of_payment: string[];
  created_at: number;
  customer_name?: string;
}

const appealStatusVariant: Record<AppealStatus, 'warning' | 'success' | 'danger'> = {
  [AppealStatus.OPEN]: 'warning',
  [AppealStatus.RESOLVED]: 'success',
  [AppealStatus.REJECTED]: 'danger',
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export default function AppealsPage() {
  const queryClient = useQueryClient();
  const [selectedAppeal, setSelectedAppeal] = useState<AppealOrder | null>(null);
  const [viewingProof, setViewingProof] = useState<string | null>(null);

  const { data: appeals, isLoading, refetch } = useQuery({
    queryKey: ['trader', 'appeals'],
    queryFn: () => api.get<AppealOrder[]>('/api/trader/appeals'),
  });

  const resolveMutation = useMutation({
    mutationFn: (appealId: string) =>
      api.post(`/api/trader/appeals/${appealId}/resolve`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trader', 'appeals'] });
      setSelectedAppeal(null);
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (appealId: string) =>
      api.post(`/api/trader/appeals/${appealId}/reject`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trader', 'appeals'] });
      setSelectedAppeal(null);
    },
  });

  const columns = [
    {
      key: 'order_id',
      header: 'Order ID',
      render: (row: AppealOrder) => (
        <span className="font-mono text-xs text-text-muted">{shortId(row.order_id)}</span>
      ),
    },
    {
      key: 'amount',
      header: 'Expected',
      render: (row: AppealOrder) => (
        <span className="font-medium">{formatCurrency(row.amount, row.currency)}</span>
      ),
    },
    {
      key: 'paid_amount',
      header: 'Actually Paid',
      render: (row: AppealOrder) => (
        <span className={cn('font-medium', row.paid_amount !== row.amount ? 'text-accent-yellow' : 'text-accent-green')}>
          {formatCurrency(row.paid_amount, row.currency)}
        </span>
      ),
    },
    {
      key: 'appeal_status',
      header: 'Status',
      render: (row: AppealOrder) => (
        <Badge variant={appealStatusVariant[row.appeal_status]} dot>
          {row.appeal_status}
        </Badge>
      ),
    },
    {
      key: 'proofs',
      header: 'Proofs',
      render: (row: AppealOrder) => (
        <span className="text-text-muted text-sm">
          {row.proofs_of_payment.length} file{row.proofs_of_payment.length !== 1 ? 's' : ''}
        </span>
      ),
    },
    {
      key: 'created_at',
      header: 'Created',
      render: (row: AppealOrder) => (
        <span className="text-text-muted text-sm">{formatDate(row.created_at)}</span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (row: AppealOrder) => (
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          {row.appeal_status === AppealStatus.OPEN && (
            <>
              <Button
                size="sm"
                variant="success"
                onClick={() => resolveMutation.mutate(row.appeal_id)}
                loading={resolveMutation.isPending}
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                Resolve
              </Button>
              <Button
                size="sm"
                variant="danger"
                onClick={() => rejectMutation.mutate(row.appeal_id)}
                loading={rejectMutation.isPending}
              >
                <XCircle className="h-3.5 w-3.5" />
                Reject
              </Button>
            </>
          )}
          <Button size="sm" variant="ghost" onClick={() => setSelectedAppeal(row)}>
            <Eye className="h-3.5 w-3.5" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <AlertTriangle className="h-6 w-6 text-accent-yellow" />
          <div>
            <h1 className="text-2xl font-bold text-text-primary">Appeals</h1>
            <p className="text-sm text-text-muted">Disputed orders requiring review</p>
          </div>
        </div>
        <Button variant="secondary" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      <Table
        columns={columns}
        data={appeals ?? []}
        keyExtractor={(row) => row.appeal_id}
        loading={isLoading}
        onRowClick={(row) => setSelectedAppeal(row)}
        emptyMessage="No appeals found"
      />

      {/* Appeal Details Modal */}
      <Modal
        open={!!selectedAppeal}
        onClose={() => setSelectedAppeal(null)}
        title="Appeal Details"
        size="lg"
      >
        {selectedAppeal && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <DetailRow label="Order ID" value={selectedAppeal.order_id} mono />
              <DetailRow label="Request ID" value={selectedAppeal.order_request_id} mono />
              <DetailRow label="Expected Amount" value={formatCurrency(selectedAppeal.amount, selectedAppeal.currency)} />
              <DetailRow label="Paid Amount" value={formatCurrency(selectedAppeal.paid_amount, selectedAppeal.currency)} />
              <DetailRow label="Difference" value={formatCurrency(selectedAppeal.paid_amount - selectedAppeal.amount, selectedAppeal.currency)} />
              <DetailRow label="Status">
                <Badge variant={appealStatusVariant[selectedAppeal.appeal_status]} dot>
                  {selectedAppeal.appeal_status}
                </Badge>
              </DetailRow>
              <DetailRow label="Created" value={formatDateFull(selectedAppeal.created_at)} />
            </div>

            {selectedAppeal.proofs_of_payment.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-text-secondary">Proof Files</h3>
                <div className="grid grid-cols-3 gap-3">
                  {selectedAppeal.proofs_of_payment.map((fileId) => (
                    <button
                      key={fileId}
                      onClick={() => setViewingProof(fileId)}
                      className="group relative aspect-video overflow-hidden rounded-lg border border-border-primary bg-bg-secondary hover:border-accent-blue transition-colors cursor-pointer"
                    >
                      <img
                        src={`${API_BASE}/api/files/${fileId}`}
                        alt="Proof of payment"
                        className="h-full w-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                          (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                        }}
                      />
                      <div className="hidden flex-col items-center justify-center absolute inset-0 text-text-muted">
                        <FileText className="h-6 w-6 mb-1" />
                        <span className="text-xs">View file</span>
                      </div>
                      <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/40 transition-colors">
                        <ExternalLink className="h-5 w-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {selectedAppeal.appeal_status === AppealStatus.OPEN && (
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="success"
                  onClick={() => resolveMutation.mutate(selectedAppeal.appeal_id)}
                  loading={resolveMutation.isPending}
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Resolve Appeal
                </Button>
                <Button
                  variant="danger"
                  onClick={() => rejectMutation.mutate(selectedAppeal.appeal_id)}
                  loading={rejectMutation.isPending}
                >
                  <XCircle className="h-4 w-4" />
                  Reject Appeal
                </Button>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Proof Image Modal */}
      <Modal
        open={!!viewingProof}
        onClose={() => setViewingProof(null)}
        title="Proof of Payment"
        size="xl"
      >
        {viewingProof && (
          <div className="flex items-center justify-center">
            <img
              src={`${API_BASE}/api/files/${viewingProof}`}
              alt="Proof of payment"
              className="max-h-[70vh] max-w-full rounded-lg object-contain"
            />
          </div>
        )}
      </Modal>
    </div>
  );
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
