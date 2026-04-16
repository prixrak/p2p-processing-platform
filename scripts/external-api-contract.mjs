/**
 * Node ESM mirror of packages/shared/src/external-api.ts — keep values identical.
 */
export const EXTERNAL_API_V1_PREFIX = '/api/external/v1';

export const ExternalApiHeaders = {
  API_KEY: 'X-API-KEY',
  API_PAYLOAD: 'X-API-PAYLOAD',
  API_SIGNATURE: 'X-API-SIGNATURE',
};

export const ExternalApiHeadersLower = {
  API_KEY: ExternalApiHeaders.API_KEY.toLowerCase(),
  API_PAYLOAD: ExternalApiHeaders.API_PAYLOAD.toLowerCase(),
  API_SIGNATURE: ExternalApiHeaders.API_SIGNATURE.toLowerCase(),
};
