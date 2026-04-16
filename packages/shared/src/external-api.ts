/**
 * Merchant external HMAC API: canonical header names (documentation, Swagger, clients).
 * Express exposes request headers lowercased; use ExternalApiHeadersLower for lookups.
 *
 * Node ESM scripts mirror these values in `scripts/external-api-contract.mjs` (keep identical).
 */
export const ExternalApiHeaders = {
  API_KEY: 'X-API-KEY',
  API_PAYLOAD: 'X-API-PAYLOAD',
  API_SIGNATURE: 'X-API-SIGNATURE',
} as const;

export type ExternalApiHeaderName = (typeof ExternalApiHeaders)[keyof typeof ExternalApiHeaders];

/** Lowercase header keys as used by Node/Express `request.headers`. */
export const ExternalApiHeadersLower = {
  API_KEY: ExternalApiHeaders.API_KEY.toLowerCase(),
  API_PAYLOAD: ExternalApiHeaders.API_PAYLOAD.toLowerCase(),
  API_SIGNATURE: ExternalApiHeaders.API_SIGNATURE.toLowerCase(),
} as const;

/** Base path for POST-only merchant API (preserve exact string for backward compatibility). */
export const EXTERNAL_API_V1_PREFIX = '/api/external/v1' as const;
