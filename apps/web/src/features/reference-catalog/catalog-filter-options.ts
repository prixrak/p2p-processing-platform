import type { ListPageSelectOption } from '@/components/ui/list-page-tools';

export const CATALOG_STATUS_FILTER_OPTIONS: ListPageSelectOption[] = [
  { value: '', label: 'All statuses' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
];
