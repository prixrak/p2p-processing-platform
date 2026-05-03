import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { internalPaths } from '@/lib/internal-api';
import { staffTraderKeys, type StaffRolePrefix } from '@/lib/query-keys';
import type { StaffTraderRow } from './staff-trader-types';

export function useStaffTraders(staffRole: StaffRolePrefix) {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');

  const { data: tradersRaw = [], isLoading } = useQuery<StaffTraderRow[]>({
    queryKey: staffTraderKeys.list(staffRole),
    queryFn: async () => {
      const res = await api.get<{
        data: Array<{
          id: string;
          isActive: boolean;
          user: { email: string };
          requisites?: unknown[];
          ordersCount?: number;
          totalVolume?: number;
          payoutMinLimit?: number | string | null;
          payoutMaxLimit?: number | string | null;
        }>;
      }>(`${internalPaths.traders}?page=1&limit=500`);
      return res.data.map((p) => ({
        id: p.id,
        name: p.user.email.split('@')[0] ?? 'Trader',
        email: p.user.email,
        status: p.isActive ? 'active' : 'inactive',
        activeRequisitesCount: Array.isArray(p.requisites) ? p.requisites.length : 0,
        totalVolume: p.totalVolume ?? 0,
        ordersCount: p.ordersCount ?? 0,
        payoutMinLimit: p.payoutMinLimit ? Number(p.payoutMinLimit) : 0,
        payoutMaxLimit: p.payoutMaxLimit ? Number(p.payoutMaxLimit) : 0,
      }));
    },
  });

  const traders = useMemo(() => {
    let list = tradersRaw;
    if (statusFilter === 'active') list = list.filter((t) => t.status === 'active');
    if (statusFilter === 'inactive') list = list.filter((t) => t.status === 'inactive');
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (t) =>
          t.email.toLowerCase().includes(q) || t.name.toLowerCase().includes(q),
      );
    }
    return list;
  }, [tradersRaw, statusFilter, search]);

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      enabled
        ? api.patch(internalPaths.traderActivate(id))
        : api.patch(internalPaths.traderDeactivate(id)),
    onSuccess: (_data, vars) => {
      queryClient.setQueryData<StaffTraderRow[]>(
        staffTraderKeys.list(staffRole),
        (old) =>
          old?.map((row) =>
            row.id !== vars.id
              ? row
              : {
                  ...row,
                  status: vars.enabled ? 'active' : 'inactive',
                },
          ),
      );
    },
  });

  return {
    traders,
    isLoading,
    statusFilter,
    setStatusFilter,
    search,
    setSearch,
    toggleMutation,
  };
}
