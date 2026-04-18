/** React Query key helpers for staff (admin/owner) trader management. */
export type StaffRolePrefix = 'admin' | 'owner';

export const staffTraderKeys = {
  list: (prefix: StaffRolePrefix) => [prefix, 'traders', 'list'] as const,
  detail: (prefix: StaffRolePrefix, id: string) => [prefix, 'traders', id] as const,
  traderOptions: (prefix: StaffRolePrefix) => [prefix, 'traders', 'options'] as const,
};
