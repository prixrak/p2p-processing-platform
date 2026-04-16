'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  RefreshCw,
  Eye,
  FileText,
  ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Badge } from '@/components/ui/badge';
import { Table } from '@/components/ui/table';
import { Modal } from '@/components/ui/modal';
import { api } from '@/lib/api';
import { internalPaths } from '@/lib/internal-api';
import { formatDate, formatDateFull, shortId, cn } from '@/lib/utils';
import { AppealStatus } from '@p2p/shared';
import type { AppealDto } from '@p2p/shared';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

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

export default function AppealsPage() {
  const [selectedAppeal, setSelectedAppeal] = useState<AppealDto | null>(null);
  const [viewingProof, setViewingProof] = useState<string | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['trader', 'appeals'],
    queryFn: () => api.get<AppealsListResponse>(internalPaths.appeals),
  });

  const appeals = data?.items ?? [];

  const columns = [
    {
      key: 'id',
      header: 'Appeal',
      className: 'font-mono tabular-nums text-end',
      render: (row: AppealDto) => (
        <span className="font-mono text-xs text-text-muted">{shortId(row.id)}</span>
      ),
    },
    {
      key: 'paid_amount',
      header: 'Reported paid',
      className: 'text-end tabular-nums',
      render: (row: AppealDto) => (
        <span className="font-medium">{row.paid_amount.toLocaleString()}</span>
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
            <Eye className="h-3.5 w-3.5" />
          </IconButton>
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
            <p className="text-sm text-text-muted">
              Appeals on your pay-in orders. Resolve/reject is done by platform owners in the admin
              tools.
            </p>
          </div>
        </div>
        <Button variant="secondary" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      <Table
        columns={columns}
        data={appeals}
        keyExtractor={(row) => row.id}
        loading={isLoading}
        onRowClick={(row) => setSelectedAppeal(row)}
        emptyMessage="No appeals found"
      />

      <Modal
        open={!!selectedAppeal}
        onClose={() => setSelectedAppeal(null)}
        title="Appeal Details"
        size="lg"
      >
        {selectedAppeal && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <DetailRow label="Appeal ID" value={selectedAppeal.id} mono />
              <DetailRow label="Paid amount (reported)" value={String(selectedAppeal.paid_amount)} />
              <DetailRow label="Status">
                <Badge variant={appealStatusVariant[selectedAppeal.status]} dot>
                  {selectedAppeal.status}
                </Badge>
              </DetailRow>
              <DetailRow label="Created" value={formatDateFull(selectedAppeal.created_at)} />
            </div>

            {selectedAppeal.proofs_of_payment.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-text-secondary">Proof files</h3>
                <p className="text-xs text-text-muted">
                  File access may require admin/support role on the API.
                </p>
                <div className="grid grid-cols-3 gap-3">
                  {selectedAppeal.proofs_of_payment.map((fileId) => (
                    <button
                      key={fileId}
                      type="button"
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
