'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowUpFromLine,
  RefreshCw,
  Filter,
  Eye,
  Play,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Table } from '@/components/ui/table';
import { Modal } from '@/components/ui/modal';
import { Select } from '@/components/ui/select';
import { api } from '@/lib/api';
import { formatCurrency, formatDate, formatDateFull, shortId, cn } from '@/lib/utils';
import { payoutStatusVariant } from '@/lib/status-helpers';
import { PayOutOrderStatus } from '@p2p/shared';
import type { PayOutOrderApiDto } from '@p2p/shared';

interface PayOutListResponse {
  orders: PayOutOrderApiDto[];
  total: number;
}

export default function PayOutOrdersPage() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<PayOutOrderApiDto | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  const queryParams: Record<string, string> = {};
  if (statusFilter) queryParams.status = statusFilter;

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['trader', 'payout-orders', queryParams],
    queryFn: () => api.get<PayOutListResponse>('/api/trader/payout/orders', queryParams),
  });

  const takeMutation = useMutation({
    mutationFn: (orderId: string) =>
      api.post(`/api/trader/payout/orders/${orderId}/take`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trader', 'payout-orders'] });
    },
  });

  const completeMutation = useMutation({
    mutationFn: (orderId: string) =>
      api.post(`/api/trader/payout/orders/${orderId}/complete`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trader', 'payout-orders'] });
      setSelectedOrder(null);
    },
  });

  const failMutation = useMutation({
    mutationFn: (orderId: string) =>
      api.post(`/api/trader/payout/orders/${orderId}/fail`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trader', 'payout-orders'] });
      setSelectedOrder(null);
    },
  });

  const statusOptions = Object.values(PayOutOrderStatus).map((s) => ({
    value: s,
    label: s,
  }));

  const columns = [
    {
      key: 'id',
      header: 'ID',
      render: (row: PayOutOrderApiDto) => (
        <span className="font-mono text-xs text-text-muted">{shortId(row.id)}</span>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      render: (row: PayOutOrderApiDto) => (
        <span className="font-medium">{formatCurrency(row.amount, row.currency)}</span>
      ),
    },
    {
      key: 'currency',
      header: 'Currency',
      render: (row: PayOutOrderApiDto) => (
        <span className="text-text-secondary">{row.currency}</span>
      ),
    },
    {
      key: 'recipient',
      header: 'Recipient',
      render: (row: PayOutOrderApiDto) => (
        <div className="flex flex-col">
          <span className="font-mono text-xs">{row.details.number}</span>
          {row.details.owner && (
            <span className="text-xs text-text-muted">{row.details.owner}</span>
          )}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row: PayOutOrderApiDto) => (
        <Badge variant={payoutStatusVariant[row.status]} dot>
          {row.status}
        </Badge>
      ),
    },
    {
      key: 'created_at',
      header: 'Created',
      render: (row: PayOutOrderApiDto) => (
        <span className="text-text-muted text-sm">{formatDate(row.created_at)}</span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (row: PayOutOrderApiDto) => (
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          {row.status === PayOutOrderStatus.NEW && (
            <Button
              size="sm"
              variant="primary"
              onClick={() => takeMutation.mutate(row.id)}
              loading={takeMutation.isPending}
            >
              <Play className="h-3.5 w-3.5" />
              Take
            </Button>
          )}
          {row.status === PayOutOrderStatus.PROCESSING && (
            <>
              <Button
                size="sm"
                variant="success"
                onClick={() => completeMutation.mutate(row.id)}
                loading={completeMutation.isPending}
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                Complete
              </Button>
              <Button
                size="sm"
                variant="danger"
                onClick={() => failMutation.mutate(row.id)}
                loading={failMutation.isPending}
              >
                <XCircle className="h-3.5 w-3.5" />
                Failed
              </Button>
            </>
          )}
          <Button size="sm" variant="ghost" onClick={() => setSelectedOrder(row)}>
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
          <ArrowUpFromLine className="h-6 w-6 text-accent-blue" />
          <div>
            <h1 className="text-2xl font-bold text-text-primary">Pay-Out Orders</h1>
            <p className="text-sm text-text-muted">{data?.total ?? 0} total orders</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="secondary" size="sm" onClick={() => setShowFilters(!showFilters)}>
            <Filter className="h-4 w-4" />
            Filters
          </Button>
          <Button variant="secondary" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {showFilters && (
        <Card className="animate-slide-up">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Select
              label="Status"
              options={statusOptions}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              placeholder="All statuses"
            />
          </div>
          <div className="mt-4 flex justify-end">
            <Button variant="ghost" size="sm" onClick={() => setStatusFilter('')}>
              Clear
            </Button>
          </div>
        </Card>
      )}

      <Table
        columns={columns}
        data={data?.orders ?? []}
        keyExtractor={(row) => row.id}
        loading={isLoading}
        onRowClick={(row) => setSelectedOrder(row)}
        emptyMessage="No pay-out orders found"
      />

      <Modal
        open={!!selectedOrder}
        onClose={() => setSelectedOrder(null)}
        title="Pay-Out Order Details"
        size="lg"
      >
        {selectedOrder && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <DetailRow label="Order ID" value={selectedOrder.id} mono />
              <DetailRow label="Request ID" value={selectedOrder.request_id} mono />
              <DetailRow label="Amount" value={formatCurrency(selectedOrder.amount, selectedOrder.currency)} />
              <DetailRow label="Currency" value={selectedOrder.currency} />
              <DetailRow label="Status">
                <Badge variant={payoutStatusVariant[selectedOrder.status]} dot>
                  {selectedOrder.status}
                </Badge>
              </DetailRow>
              <DetailRow label="Rate" value={String(selectedOrder.rate)} />
              <DetailRow label="Partner Amount" value={String(selectedOrder.partner_amount)} />
              <DetailRow label="Fee" value={`${selectedOrder.percent_fee}%`} />
              <DetailRow label="Created" value={formatDateFull(selectedOrder.created_at)} />
              {selectedOrder.start_at && (
                <DetailRow label="Started" value={formatDateFull(selectedOrder.start_at)} />
              )}
              {selectedOrder.end_at && (
                <DetailRow label="Completed" value={formatDateFull(selectedOrder.end_at)} />
              )}
            </div>

            <div className="rounded-lg border border-border-primary p-4">
              <h3 className="mb-3 text-sm font-medium text-text-secondary">Recipient Details</h3>
              <div className="grid grid-cols-2 gap-3">
                <DetailRow label="Type" value={selectedOrder.details.type} />
                <DetailRow label="Number" value={selectedOrder.details.number} mono />
                <DetailRow label="Owner" value={selectedOrder.details.owner ?? '-'} />
                <DetailRow label="Code" value={selectedOrder.details.code ?? '-'} />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              {selectedOrder.status === PayOutOrderStatus.NEW && (
                <Button
                  variant="primary"
                  onClick={() => takeMutation.mutate(selectedOrder.id)}
                  loading={takeMutation.isPending}
                >
                  <Play className="h-4 w-4" />
                  Take Order
                </Button>
              )}
              {selectedOrder.status === PayOutOrderStatus.PROCESSING && (
                <>
                  <Button
                    variant="success"
                    onClick={() => completeMutation.mutate(selectedOrder.id)}
                    loading={completeMutation.isPending}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Mark Completed
                  </Button>
                  <Button
                    variant="danger"
                    onClick={() => failMutation.mutate(selectedOrder.id)}
                    loading={failMutation.isPending}
                  >
                    <XCircle className="h-4 w-4" />
                    Mark Failed
                  </Button>
                </>
              )}
            </div>
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
