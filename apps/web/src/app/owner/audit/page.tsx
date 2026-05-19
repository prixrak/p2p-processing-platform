'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { internalPaths } from '@/lib/internal-api';
import { useDebouncedTextFilter } from '@/lib/hooks/use-debounced-value';
import { ownerKeys } from '@/lib/query-keys';
import { FilterBar, FilterInput, FilterSelect } from '@/components/ui/filters';
import { Badge } from '@/components/ui/badge';
import { DataTable } from '@/components/ui/data-table';
import { summarizeAuditValue } from '@/lib/audit-display';
import { formatDateTime } from '@/lib/utils';

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

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function valueSummary(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  return summarizeAuditValue(v, 200);
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
  const {
    value: searchInput,
    setValue: setSearchInput,
    debounced: debouncedSearch,
  } = useDebouncedTextFilter();
  const [actionFilter, setActionFilter] = useState('');
  const [entityFilter, setEntityFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, actionFilter, entityFilter, dateFrom, dateTo]);

  const { data, isLoading } = useQuery({
    queryKey: ownerKeys.audit(page, debouncedSearch, actionFilter, entityFilter, dateFrom, dateTo),
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: '30',
      });
      if (actionFilter) params.set('action', actionFilter);
      if (entityFilter) params.set('entityType', entityFilter);
      if (dateFrom) params.set('from', new Date(dateFrom).toISOString());
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        params.set('to', end.toISOString());
      }
      const q = debouncedSearch;
      if (q && UUID_RE.test(q)) {
        params.set('actorId', q);
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
          ip: string | null;
        }>;
        total: number;
        page: number;
        limit: number;
      }>(`${internalPaths.audit}?${params}`);

      const items = Array.isArray(res?.items) ? res.items : [];
      const limit = res.limit || 30;
      const dataRows: AuditEntry[] = items.map((log) => ({
        id: log.id,
        actor: log.actor?.email ?? '—',
        actorRole: String(log.actor?.role ?? log.actorRole ?? '—'),
        action: log.action,
        entity: log.entityType,
        entityId: log.entityId ?? '',
        previousValue: valueSummary(log.oldValue),
        newValue: valueSummary(log.newValue),
        ipAddress: log.ip ?? '—',
        timestamp: log.createdAt,
      }));

      return {
        data: dataRows,
        total: res.total,
        page: res.page,
        totalPages: Math.max(1, Math.ceil(res.total / limit)),
      } satisfies AuditResponse;
    },
  });

  const columns = [
    {
      key: 'timestamp',
      header: 'Time',
      className: 'font-mono tabular-nums',
      render: (e: AuditEntry) => (
        <span className="whitespace-nowrap text-sm text-text-muted">
          {formatDateTime(new Date(e.timestamp))}
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
      className: 'text-center',
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
          <p className="font-mono text-xs text-text-muted">
            {e.entityId ? e.entityId.slice(0, 12) : '—'}
          </p>
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

      <FilterBar>
        <FilterInput
          label="Actor ID"
          value={searchInput}
          onChange={setSearchInput}
          placeholder="User ID (optional)"
          className="w-60 min-w-[12rem]"
        />
        <FilterSelect
          label="Action"
          value={actionFilter}
          onChange={setActionFilter}
          options={[
            { value: '', label: 'All Actions' },
            { value: 'CREATE', label: 'Create' },
            { value: 'CREATE_USER', label: 'Create user' },
            { value: 'UPDATE', label: 'Update' },
            { value: 'UPDATE_USER', label: 'Update user' },
            { value: 'LOGIN', label: 'Login' },
          ]}
          className="w-40"
        />
        <FilterSelect
          label="Entity"
          value={entityFilter}
          onChange={setEntityFilter}
          options={[
            { value: '', label: 'All Entities' },
            { value: 'User', label: 'User' },
            { value: 'Merchant', label: 'Merchant' },
            { value: 'Currency', label: 'Currency' },
            { value: 'Settlement', label: 'Settlement' },
            { value: 'Requisite', label: 'Requisite' },
            { value: 'Direction', label: 'Direction' },
          ]}
          className="w-40"
        />
        <FilterInput
          label="From"
          type="date"
          value={dateFrom}
          onChange={setDateFrom}
          className="w-40"
        />
        <FilterInput
          label="To"
          type="date"
          value={dateTo}
          onChange={setDateTo}
          className="w-40"
        />
      </FilterBar>

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
