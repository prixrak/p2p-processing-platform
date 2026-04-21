'use client';

import { notFound } from 'next/navigation';

/** Build-time stub when `INCLUDE_EXTERNAL_PLAYGROUND` excludes the real playground from the bundle. */
export function ExternalApiPlayground() {
  notFound();
}
