'use client';

import { useMemo, useState } from 'react';
import { Users } from 'lucide-react';
import { DataTable } from '@/components/ui/data-table';
import { FilterBar, FilterInput, FilterSelect } from '@/components/ui/filters';
import { buildStaffTradersColumns } from './staff-traders-columns';
import type { StaffRolePrefix } from '@/lib/query-keys';
import { TraderDetailModal } from './trader-detail-modal';
import { useStaffTraders } from './use-staff-traders';

export interface StaffTradersPageProps {
  staffRole: StaffRolePrefix;
  /** Hide page title when embedded under another screen (e.g. Users tabs). */
  embedded?: boolean;
}

export function StaffTradersPage({ staffRole, embedded = false }: StaffTradersPageProps) {
  const [detailId, setDetailId] = useState<string | null>(null);

  const {
    traders,
    isLoading,
    statusFilter,
    setStatusFilter,
    search,
    setSearch,
    toggleMutation,
  } = useStaffTraders(staffRole);

  const columns = useMemo(
    () =>
      buildStaffTradersColumns({
        toggleMutation,
        onOpenTraderDetail: (row) => setDetailId(row.id),
      }),
    [toggleMutation],
  );

  return (
    <div className={embedded ? 'space-y-4' : 'space-y-6 animate-fade-in'}>
      {!embedded ? (
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
              <Users size={24} />
              Traders
            </h1>
            <p className="text-sm text-text-muted mt-1">
              Manage platform traders and their activity
            </p>
          </div>
        </div>
      ) : null}

      <FilterBar>
        <FilterInput
          label="Search"
          value={search}
          onChange={setSearch}
          placeholder="Name or email..."
        />
        <FilterSelect
          label="Status"
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { value: '', label: 'All statuses' },
            { value: 'active', label: 'Active' },
            { value: 'inactive', label: 'Inactive' },
          ]}
        />
      </FilterBar>

      <DataTable
        columns={columns}
        data={traders}
        keyExtractor={(t) => t.id}
        isLoading={isLoading}
        emptyMessage="No traders found"
        onRowClick={(row) => setDetailId(row.id)}
      />

      <TraderDetailModal
        open={!!detailId}
        onClose={() => setDetailId(null)}
        traderId={detailId}
        queryPrefix={staffRole}
      />
    </div>
  );
}
