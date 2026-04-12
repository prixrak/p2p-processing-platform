'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { DataTable } from '@/components/ui/data-table';

interface AuditEntry {
  id: string;
  actor: string;
  actorRole: string;
  action: string;
  entity: string;
  entityId: string;
  previousValue: string | null;
  newValue: string | null;
  ipAddress: string;
  timestamp: string;
}

interface AuditResponse {
  data: AuditEntry[];
  total: number;
  page: number;
  totalPages: number;
}

const actionColors: Record<string, 'green' | 'yellow' | 'red' | 'blue' | 'default'> = {
  CREATE: 'green',
  UPDATE: 'blue',
  DELETE: 'red',
  LOGIN: 'default',
  STATUS_CHANGE: 'yellow',
};

export default function AuditPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [entityFilter, setEntityFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['owner', 'audit', page, search, actionFilter, entityFilter, dateFrom, dateTo],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), limit: '30' });
      if (search) params.set('search', search);
      if (actionFilter) params.set('action', actionFilter);
      if (entityFilter) params.set('entity', entityFilter);
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);
      return api.get<AuditResponse>(`/api/admin/audit?${params}`);
    },
  });

  const columns = [
    {
      key: 'timestamp',
      header: 'Time',
      render: (e: AuditEntry) => (
        <span className="whitespace-nowrap text-sm text-text-muted">
          {new Date(e.timestamp).toLocaleString()}
        </span>
      ),
    },
    {
      key: 'actor',
      header: 'Actor',
      render: (e: AuditEntry) => (
        <div>
          <p className="text-sm font-medium text-text-primary">{e.actor}</p>
          <p className="text-xs text-text-muted capitalize">{e.actorRole}</p>
        </div>
      ),
    },
    {
      key: 'action',
      header: 'Action',
      render: (e: AuditEntry) => (
        <Badge color={actionColors[e.action] ?? 'default'}>{e.action}</Badge>
      ),
    },
    {
      key: 'entity',
      header: 'Entity',
      render: (e: AuditEntry) => (
        <div>
          <p className="text-sm text-text-primary">{e.entity}</p>
          <p className="font-mono text-xs text-text-muted">{e.entityId.slice(0, 12)}</p>
        </div>
      ),
    },
    {
      key: 'changes',
      header: 'Changes',
      render: (e: AuditEntry) => (
        <div className="max-w-xs">
          {e.previousValue && (
            <p className="truncate text-xs text-danger">
              <span className="text-text-muted">from:</span> {e.previousValue}
            </p>
          )}
          {e.newValue && (
            <p className="truncate text-xs text-success">
              <span className="text-text-muted">to:</span> {e.newValue}
            </p>
          )}
          {!e.previousValue && !e.newValue && (
            <span className="text-xs text-text-muted">—</span>
          )}
        </div>
      ),
    },
    {
      key: 'ip',
      header: 'IP',
      render: (e: AuditEntry) => (
        <span className="font-mono text-xs text-text-muted">{e.ipAddress}</span>
      ),
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Audit Log</h1>
        <p className="mt-1 text-sm text-text-muted">
          Full activity log — who did what and when
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <Input
          placeholder="Search actor or entity..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="w-60"
        />
        <Select
          options={[
            { value: '', label: 'All Actions' },
            { value: 'CREATE', label: 'Create' },
            { value: 'UPDATE', label: 'Update' },
            { value: 'DELETE', label: 'Delete' },
            { value: 'LOGIN', label: 'Login' },
            { value: 'STATUS_CHANGE', label: 'Status Change' },
          ]}
          value={actionFilter}
          onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}
          className="w-40"
        />
        <Select
          options={[
            { value: '', label: 'All Entities' },
            { value: 'USER', label: 'User' },
            { value: 'ORDER', label: 'Order' },
            { value: 'MERCHANT', label: 'Merchant' },
            { value: 'TRADER', label: 'Trader' },
            { value: 'DIRECTION', label: 'Direction' },
            { value: 'SETTLEMENT', label: 'Settlement' },
          ]}
          value={entityFilter}
          onChange={(e) => { setEntityFilter(e.target.value); setPage(1); }}
          className="w-40"
        />
        <Input
          label="From"
          type="date"
          value={dateFrom}
          onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
          className="w-40"
        />
        <Input
          label="To"
          type="date"
          value={dateTo}
          onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
          className="w-40"
        />
      </div>

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        isLoading={isLoading}
        page={page}
        totalPages={data?.totalPages}
        onPageChange={setPage}
        emptyMessage="No audit entries found"
      />
    </div>
  );
}
