'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ScrollText } from 'lucide-react';
import { api } from '@/lib/api';
import { internalPaths } from '@/lib/internal-api';
import { adminKeys } from '@/lib/query-keys';
import { DataTable } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { FilterBar, FilterSelect, FilterInput } from '@/components/ui/filters';
import { format } from 'date-fns';
import {
  summarizeAuditValue,
  humanizeFieldKey,
  formatAuditFieldValue,
} from '@/lib/audit-display';

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

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function toJsonRecord(v: unknown): Record<string, unknown> | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'object' && !Array.isArray(v)) {
    return v as Record<string, unknown>;
  }
  return { value: v as string | number | boolean };
}

export default function AuditLogPage() {
  const [actorFilter, setActorFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [entityFilter, setEntityFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const { data: entries = [], isLoading } = useQuery<AuditEntry[]>({
    queryKey: adminKeys.audit({ actorFilter, actionFilter, entityFilter, dateFrom, dateTo }),
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('page', '1');
      params.set('limit', '100');
      if (actionFilter) params.set('action', actionFilter);
      if (entityFilter) params.set('entityType', entityFilter);
      if (dateFrom) params.set('from', new Date(dateFrom).toISOString());
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        params.set('to', end.toISOString());
      }
      if (actorFilter && UUID_RE.test(actorFilter)) {
        params.set('actorId', actorFilter);
      }

      const res = await api.get<{
        items: Array<{
          id: string;
          createdAt: string;
          action: string;
          entityType: string;
          entityId: string | null;
          oldValue: unknown;
          newValue: unknown;
          actorRole: string | null;
          actor: { email: string; role: string } | null;
        }>;
      }>(`${internalPaths.audit}?${params}`);

      const rows = Array.isArray(res?.items) ? res.items : [];
      return rows.map((log) => ({
        id: log.id,
        timestamp: log.createdAt,
        actor: log.actor?.email ?? '—',
        actorRole: String(log.actor?.role ?? log.actorRole ?? '—'),
        action: log.action,
        entity: log.entityType,
        entityId: log.entityId ?? '',
        details: summarizeAuditValue(log.newValue),
        oldValue: toJsonRecord(log.oldValue),
        newValue: toJsonRecord(log.newValue),
      }));
    },
  });

  const columns = [
    {
      key: 'timestamp',
      header: 'Timestamp',
      className: 'font-mono tabular-nums',
      render: (row: AuditEntry) => (
        <span className="text-xs text-text-muted font-mono whitespace-nowrap">
          {format(new Date(row.timestamp), 'dd.MM.yy HH:mm:ss')}
        </span>
      ),
    },
    {
      key: 'actor',
      header: 'Actor',
      render: (row: AuditEntry) => (
        <div>
          <span className="text-text-primary text-sm">{row.actor}</span>
          <span className="text-text-muted text-xs ml-1.5">({row.actorRole})</span>
        </div>
      ),
    },
    {
      key: 'action',
      header: 'Action',
      className: 'text-center',
      render: (row: AuditEntry) => (
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
      render: (row: AuditEntry) => (
        <div>
          <span className="text-text-primary text-sm">{row.entity}</span>
          <span className="text-text-muted text-xs ml-1.5 font-mono">
            {row.entityId ? row.entityId.slice(0, 8) : '—'}
          </span>
        </div>
      ),
    },
    {
      key: 'details',
      header: 'Details',
      render: (row: AuditEntry) => (
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
          label="Actor ID"
          value={actorFilter}
          onChange={setActorFilter}
          placeholder="User ID (optional)"
        />
        <FilterSelect
          label="Action"
          value={actionFilter}
          onChange={setActionFilter}
          options={[
            { value: '', label: 'All actions' },
            { value: 'LOGIN', label: 'Login' },
            { value: 'CREATE_USER', label: 'Create user' },
            { value: 'UPDATE_USER', label: 'Update user' },
            { value: 'DEACTIVATE_USER', label: 'Deactivate user' },
            { value: 'CREATE', label: 'Create' },
            { value: 'UPDATE', label: 'Update' },
            { value: 'LOCK', label: 'Lock' },
            { value: 'UNLOCK', label: 'Unlock' },
          ]}
        />
        <FilterSelect
          label="Entity"
          value={entityFilter}
          onChange={setEntityFilter}
          options={[
            { value: '', label: 'All entities' },
            { value: 'User', label: 'User' },
            { value: 'Merchant', label: 'Merchant' },
            { value: 'Currency', label: 'Currency' },
            { value: 'Settlement', label: 'Settlement' },
            { value: 'Requisite', label: 'Requisite' },
            { value: 'Direction', label: 'Direction' },
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
                <p className="text-xs text-text-muted mb-2 font-medium">Previous value</p>
                <dl className="text-xs space-y-2 text-text-secondary max-h-48 overflow-y-auto">
                  {Object.entries(row.oldValue).map(([key, val]) => (
                    <div key={key}>
                      <dt className="text-text-muted">{humanizeFieldKey(key)}</dt>
                      <dd className="text-text-primary break-words">{formatAuditFieldValue(val)}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
            {row.newValue && (
              <div>
                <p className="text-xs text-text-muted mb-2 font-medium">New value</p>
                <dl className="text-xs space-y-2 text-text-secondary max-h-48 overflow-y-auto">
                  {Object.entries(row.newValue).map(([key, val]) => (
                    <div key={key}>
                      <dt className="text-text-muted">{humanizeFieldKey(key)}</dt>
                      <dd className="text-text-primary break-words">{formatAuditFieldValue(val)}</dd>
                    </div>
                  ))}
                </dl>
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
