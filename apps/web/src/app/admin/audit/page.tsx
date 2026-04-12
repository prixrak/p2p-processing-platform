'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ScrollText } from 'lucide-react';
import { api } from '@/lib/api';
import { DataTable } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { FilterBar, FilterSelect, FilterInput } from '@/components/ui/filters';
import { format } from 'date-fns';

interface AuditEntry {
  id: string;
  timestamp: string;
  actor: string;
  actorRole: string;
  action: string;
  entity: string;
  entityId: string;
  details: string;
  oldValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
}

export default function AuditLogPage() {
  const [actorFilter, setActorFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [entityFilter, setEntityFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const { data: entries = [], isLoading } = useQuery<AuditEntry[]>({
    queryKey: ['admin', 'audit', { actorFilter, actionFilter, entityFilter, dateFrom, dateTo }],
    queryFn: () => {
      const params = new URLSearchParams();
      if (actorFilter) params.set('actor', actorFilter);
      if (actionFilter) params.set('action', actionFilter);
      if (entityFilter) params.set('entity', entityFilter);
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);
      return api.get(`/api/admin/audit?${params}`);
    },
  });

  const columns = [
    {
      key: 'timestamp',
      header: 'Timestamp',
      render: (row) => (
        <span className="text-xs text-text-muted font-mono whitespace-nowrap">
          {format(new Date(row.timestamp), 'dd.MM.yy HH:mm:ss')}
        </span>
      ),
    },
    {
      key: 'actor',
      header: 'Actor',
      render: (row) => (
        <div>
          <span className="text-text-primary text-sm">{row.actor}</span>
          <span className="text-text-muted text-xs ml-1.5">({row.actorRole})</span>
        </div>
      ),
    },
    {
      key: 'action',
      header: 'Action',
      render: (row) => (
        <Badge
          variant={
            row.action.includes('delete') || row.action.includes('disable')
              ? 'danger'
              : row.action.includes('create') || row.action.includes('enable')
                ? 'success'
                : 'info'
          }
        >
          {row.action}
        </Badge>
      ),
    },
    {
      key: 'entity',
      header: 'Entity',
      render: (row) => (
        <div>
          <span className="text-text-primary text-sm">{row.entity}</span>
          <span className="text-text-muted text-xs ml-1.5 font-mono">
            {row.entityId.slice(0, 8)}
          </span>
        </div>
      ),
    },
    {
      key: 'details',
      header: 'Details',
      render: (row) => (
        <span className="text-text-muted text-xs max-w-[200px] truncate block">
          {row.details || '—'}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
          <ScrollText size={24} />
          Audit Log
        </h1>
        <p className="text-sm text-text-muted mt-1">
          Complete activity log for all platform actions
        </p>
      </div>

      <FilterBar>
        <FilterInput
          label="Actor"
          value={actorFilter}
          onChange={setActorFilter}
          placeholder="User email..."
        />
        <FilterSelect
          label="Action"
          value={actionFilter}
          onChange={setActionFilter}
          options={[
            { value: '', label: 'All actions' },
            { value: 'create', label: 'Create' },
            { value: 'update', label: 'Update' },
            { value: 'delete', label: 'Delete' },
            { value: 'enable', label: 'Enable' },
            { value: 'disable', label: 'Disable' },
            { value: 'assign', label: 'Assign' },
            { value: 'status_change', label: 'Status Change' },
          ]}
        />
        <FilterSelect
          label="Entity"
          value={entityFilter}
          onChange={setEntityFilter}
          options={[
            { value: '', label: 'All entities' },
            { value: 'order', label: 'Order' },
            { value: 'trader', label: 'Trader' },
            { value: 'merchant', label: 'Merchant' },
            { value: 'settlement', label: 'Settlement' },
            { value: 'requisite', label: 'Requisite' },
            { value: 'api_key', label: 'API Key' },
          ]}
        />
        <FilterInput
          label="From"
          type="date"
          value={dateFrom}
          onChange={setDateFrom}
        />
        <FilterInput
          label="To"
          type="date"
          value={dateTo}
          onChange={setDateTo}
        />
      </FilterBar>

      <DataTable
        columns={columns}
        data={entries}
        keyExtractor={(e) => e.id}
        isLoading={isLoading}
        emptyMessage="No audit entries found"
        expandable={(row) => (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {row.oldValue && (
              <div>
                <p className="text-xs text-text-muted mb-1 font-medium">
                  Previous Value
                </p>
                <pre className="text-xs text-text-secondary bg-bg-primary rounded-lg p-3 overflow-x-auto max-h-48">
                  {JSON.stringify(row.oldValue, null, 2)}
                </pre>
              </div>
            )}
            {row.newValue && (
              <div>
                <p className="text-xs text-text-muted mb-1 font-medium">
                  New Value
                </p>
                <pre className="text-xs text-text-secondary bg-bg-primary rounded-lg p-3 overflow-x-auto max-h-48">
                  {JSON.stringify(row.newValue, null, 2)}
                </pre>
              </div>
            )}
            {!row.oldValue && !row.newValue && (
              <p className="text-xs text-text-muted">No value changes recorded</p>
            )}
          </div>
        )}
      />
    </div>
  );
}
