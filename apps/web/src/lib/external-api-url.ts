/**
 * Base URL for external merchant API calls (same convention as `API_BASE` in `src/lib/api.ts`).
 * When empty, paths stay relative (same origin as the web app).
 */
export function externalApiUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_API_URL ?? '';
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  if (!base) return normalizedPath;
  return `${base.replace(/\/$/, '')}${normalizedPath}`;
}
