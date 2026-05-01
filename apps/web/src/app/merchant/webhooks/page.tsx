'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Webhook, RotateCw } from 'lucide-react';
import { api } from '@/lib/api';
import { internalPaths } from '@/lib/internal-api';
import { DataTable } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FilterBar, FilterSelect } from '@/components/ui/filters';
import { format } from 'date-fns';

interface WebhookLog {
  id: string;
  timestamp: string;
  method: string;
  statusCode: number | null;
  url: string;
  orderId: string;
  status: 'sent' | 'failed' | 'dlq';
  responseTime: number | null;
  attempts: number;
}

const statusVariant: Record<string, 'success' | 'danger' | 'warning'> = {
  sent: 'success',
  failed: 'danger',
  dlq: 'danger',
};

export default function WebhooksPage() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('');
  const [resendingId, setResendingId] = useState<string | null>(null);

  const { data: logs = [], isLoading } = useQuery<WebhookLog[]>({
    queryKey: ['merchant', 'webhooks', { status: statusFilter }],
    queryFn: () => {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      return api.get(internalPaths.merchantWebhooks(params.toString()));
    },
  });

  const resendMutation = useMutation({
    mutationFn: (webhookId: string) =>
      api.post(internalPaths.merchantWebhookResend(webhookId)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['merchant', 'webhooks'] });
      setResendingId(null);
    },
  });

  const columns = [
    {
      key: 'timestamp',
      header: 'Timestamp',
      className: 'font-mono tabular-nums',
      render: (row: WebhookLog) => (
        <span className="text-xs text-text-muted font-mono whitespace-nowrap">
          {format(new Date(row.timestamp), 'dd.MM.yy HH:mm:ss')}
        </span>
      ),
    },
    {
      key: 'method',
      header: 'Method',
      className: 'text-center',
      render: (row: WebhookLog) => (
        <span className="text-xs font-medium text-accent-blue">{row.method}</span>
      ),
    },
    {
      key: 'statusCode',
      header: 'Status Code',
      className: 'text-end tabular-nums font-mono',
      render: (row: WebhookLog) => (
        <span
          className={`font-mono text-sm ${
            row.statusCode && row.statusCode >= 200 && row.statusCode < 300
              ? 'text-accent-green'
              : 'text-accent-red'
          }`}
        >
          {row.statusCode ?? '—'}
        </span>
      ),
    },
    {
      key: 'url',
      header: 'URL',
      render: (row: WebhookLog) => (
        <span className="text-xs text-text-secondary font-mono max-w-[250px] truncate block">
          {row.url}
        </span>
      ),
    },
    {
      key: 'orderId',
      header: 'Order ID',
      className: 'font-mono tabular-nums text-end',
      render: (row: WebhookLog) => (
        <span className="font-mono text-xs text-text-muted">
          {row.orderId.slice(0, 8)}...
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Delivery',
      className: 'text-center',
      render: (row: WebhookLog) => (
        <Badge variant={statusVariant[row.status] ?? 'muted'}>
          {row.status.toUpperCase()}
        </Badge>
      ),
    },
    {
      key: 'attempts',
      header: 'Attempts',
      className: 'text-end tabular-nums',
      render: (row: WebhookLog) => <span className="text-text-muted text-xs">{row.attempts}</span>,
    },
    {
      key: 'actions',
      header: '',
      className: 'text-end',
      render: (row: WebhookLog) =>
        row.status !== 'sent' ? (
          <Button
            size="sm"
            variant="ghost"
            icon={<RotateCw size={12} />}
            loading={resendingId === row.id && resendMutation.isPending}
            onClick={(e) => {
              e.stopPropagation();
              setResendingId(row.id);
              resendMutation.mutate(row.id);
            }}
          >
            Resend
          </Button>
        ) : null,
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
          <Webhook size={24} />
          Webhook Logs
        </h1>
        <p className="text-sm text-text-muted mt-1">
          Monitor webhook delivery and retry failed attempts
        </p>
      </div>

      <FilterBar>
        <FilterSelect
          label="Delivery Status"
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { value: '', label: 'All statuses' },
            { value: 'sent', label: 'Sent' },
            { value: 'failed', label: 'Failed' },
            { value: 'dlq', label: 'DLQ' },
          ]}
        />
      </FilterBar>

      <DataTable
        columns={columns}
        data={logs}
        keyExtractor={(l) => l.id}
        isLoading={isLoading}
        emptyMessage="No webhook logs found"
      />
    </div>
  );
}
