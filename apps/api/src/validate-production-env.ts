import { getEffectiveEnv } from '@p2p/config';

const DEV_JWT_SECRETS = new Set([
  'dev-jwt-secret-change-me',
  'dev-jwt-secret-change-me-in-production',
]);
const DEV_ENCRYPTION_KEYS = new Set(['dev-encryption-key-change-me-in-prod']);
const LOCALHOST_MARKERS = ['localhost', '127.0.0.1'];

function isLocalUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return LOCALHOST_MARKERS.some((h) => lower.includes(h));
}

/**
 * Fail fast on unsafe defaults before Nest bootstraps (API and worker).
 * Call immediately after `load-env` when `NODE_ENV` is already set (e.g. Docker).
 */
export function assertSafeProductionEnvironment(): void {
  if (process.env.NODE_ENV !== 'production') {
    return;
  }

  const errors: string[] = [];

  const jwt = getEffectiveEnv('JWT_SECRET')?.trim() ?? '';
  if (!jwt) {
    errors.push('JWT_SECRET is required in production');
  } else if (jwt.length < 32) {
    errors.push('JWT_SECRET must be at least 32 characters in production');
  } else if (DEV_JWT_SECRETS.has(jwt)) {
    errors.push('JWT_SECRET must not use a development default in production');
  }

  const enc = getEffectiveEnv('ENCRYPTION_KEY')?.trim() ?? '';
  if (!enc) {
    errors.push('ENCRYPTION_KEY is required in production');
  } else if (enc.length < 32) {
    errors.push('ENCRYPTION_KEY must be at least 32 characters in production');
  } else if (DEV_ENCRYPTION_KEYS.has(enc)) {
    errors.push('ENCRYPTION_KEY must not use a development default in production');
  }

  const internal = getEffectiveEnv('INTERNAL_API_KEY')?.trim() ?? '';
  if (!internal) {
    errors.push('INTERNAL_API_KEY is required in production (/api/internal/*)');
  }

  const db = getEffectiveEnv('DATABASE_URL')?.trim() ?? '';
  if (!db) {
    errors.push('DATABASE_URL is required in production');
  } else if (isLocalUrl(db)) {
    errors.push('DATABASE_URL must not use localhost in production');
  }

  const base = getEffectiveEnv('BASE_URL')?.trim() ?? '';
  if (!base) {
    errors.push('BASE_URL is required in production');
  } else if (isLocalUrl(base)) {
    errors.push('BASE_URL must be a public HTTPS origin in production (not localhost)');
  }

  const frontend = getEffectiveEnv('FRONTEND_URL')?.trim() ?? '';
  if (!frontend) {
    errors.push('FRONTEND_URL is required in production');
  } else if (isLocalUrl(frontend)) {
    errors.push('FRONTEND_URL must be a public HTTPS origin in production (not localhost)');
  }

  if (errors.length > 0) {
    throw new Error(`Production environment validation failed:\n- ${errors.join('\n- ')}`);
  }
}
