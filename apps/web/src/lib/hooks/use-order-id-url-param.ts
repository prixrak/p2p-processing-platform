'use client';

import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

/**
 * Single-source-of-truth helper for the staff "orders" pages that synchronize an open detail
 * modal with a `?orderId=…` query parameter so the URL is shareable and supports browser
 * back-button navigation.
 *
 * Returns:
 * - `orderId` — current value of the query param (or `null`).
 * - `openOrderDetail(id)` — pushes `?orderId=<id>` while preserving every other query param.
 * - `closeOrderDetail()` — strips just the param.
 *
 * Use `scroll: false` so opening a modal doesn't jump the page to the top.
 */
export function useOrderIdUrlParam(opts?: {
  paramName?: string;
  validate?: (raw: string) => boolean;
}) {
  const paramName = opts?.paramName ?? 'orderId';
  const validate = opts?.validate;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const raw = searchParams.get(paramName)?.trim() ?? '';
  const orderId = raw && (validate ? validate(raw) : true) ? raw : null;

  const setParam = useCallback(
    (id: string | null) => {
      const next = new URLSearchParams(searchParams.toString());
      if (id) next.set(paramName, id);
      else next.delete(paramName);
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [paramName, pathname, router, searchParams],
  );

  const openOrderDetail = useCallback((id: string) => setParam(id), [setParam]);
  const closeOrderDetail = useCallback(() => setParam(null), [setParam]);

  return useMemo(
    () => ({ orderId, openOrderDetail, closeOrderDetail }),
    [orderId, openOrderDetail, closeOrderDetail],
  );
}
