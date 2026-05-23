/** Allowed page sizes for trader list pages (Pay-In, Pay-Out, Appeals, Requisites). */
export const LIST_PAGE_SIZE_OPTIONS = [10, 20, 30, 50, 100] as const;

export type ListPageSize = (typeof LIST_PAGE_SIZE_OPTIONS)[number];

export const DEFAULT_LIST_PAGE_SIZE: ListPageSize = 10;

export function listPageSizeOptions() {
  return LIST_PAGE_SIZE_OPTIONS.map((size) => ({
    value: String(size),
    label: String(size),
  }));
}
