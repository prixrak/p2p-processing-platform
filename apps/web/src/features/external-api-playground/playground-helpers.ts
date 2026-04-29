import { ExternalApiHeaders } from '@p2p/shared';

export const STATUS_OPTIONS = ['VERIFIED', 'CANCELED'] as const;

export function parseUnixNonce(s: string): number | null {
  const n = parseInt(s.trim(), 10);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

export function emptySigningHeaders() {
  return {
    [ExternalApiHeaders.API_KEY]: '',
    [ExternalApiHeaders.API_PAYLOAD]: '',
    [ExternalApiHeaders.API_SIGNATURE]: '',
  };
}
