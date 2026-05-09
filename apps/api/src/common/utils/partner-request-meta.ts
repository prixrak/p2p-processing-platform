import type { Request } from 'express';

/** First hop of X-Forwarded-For or Express socket IP (trimmed, max 45 chars). */
export function resolvePartnerIp(req: Request): string | null {
  const forwarded = req.headers['x-forwarded-for'];
  const raw =
    typeof forwarded === 'string'
      ? forwarded.split(',')[0]?.trim()
      : Array.isArray(forwarded)
        ? forwarded[0]?.trim()
        : '';
  const fromIp = raw || req.ip || '';
  const compact = fromIp.replace(/^::ffff:/, '');
  return compact ? compact.slice(0, 45) : null;
}

/** Request path without query string (max 512 chars), includes global `/api` prefix when present. */
export function externalMerchantApiPathFromRequest(req: Request): string | null {
  const u = req.originalUrl ?? req.url ?? '';
  const q = u.indexOf('?');
  const pathOnly = q >= 0 ? u.slice(0, q) : u;
  const trimmed = pathOnly.startsWith('/') ? pathOnly : `/${pathOnly}`;
  if (!trimmed || trimmed === '/') {
    return null;
  }
  return trimmed.length > 512 ? trimmed.slice(0, 512) : trimmed;
}

export interface ExternalOrderCreationMeta {
  partnerIp: string | null;
  externalApiPath: string | null;
}

export function buildExternalOrderCreationMeta(req: Request): ExternalOrderCreationMeta {
  return {
    partnerIp: resolvePartnerIp(req),
    externalApiPath: externalMerchantApiPathFromRequest(req),
  };
}
