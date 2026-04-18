function required(key: string): string {
  const val = process.env[key];
  if (!val && process.env.NODE_ENV === 'production') {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return val ?? '';
}

function optional(key: string, fallback: string): string {
  return process.env[key] || fallback;
}

export const config = {
  database: {
    url: optional('DATABASE_URL', 'postgresql://postgres:postgres@localhost:5432/p2p'),
  },
  redis: {
    host: optional('REDIS_HOST', 'localhost'),
    port: parseInt(optional('REDIS_PORT', '6379'), 10),
  },
  jwt: {
    secret: optional('JWT_SECRET', 'dev-jwt-secret-change-me'),
    accessExpiresIn: optional('JWT_ACCESS_EXPIRES', '15m'),
    refreshExpiresIn: optional('JWT_REFRESH_EXPIRES', '7d'),
  },
  s3: {
    bucket: optional('S3_BUCKET', 'p2p-files'),
    region: optional('S3_REGION', 'us-east-1'),
    endpoint: process.env.S3_ENDPOINT,
    accessKeyId: optional('S3_ACCESS_KEY_ID', 'minioadmin'),
    secretAccessKey: optional('S3_SECRET_ACCESS_KEY', 'minioadmin'),
    forcePathStyle: optional('S3_FORCE_PATH_STYLE', 'true') === 'true',
  },
  telegram: {
    botToken: optional('TELEGRAM_BOT_TOKEN', ''),
  },
  app: {
    port: parseInt(optional('PORT', '3001'), 10),
    baseUrl: optional('BASE_URL', 'http://localhost:3001'),
    frontendUrl: optional('FRONTEND_URL', 'http://localhost:3000'),
    nodeEnv: optional('NODE_ENV', 'development'),
    encryptionKey: optional('ENCRYPTION_KEY', 'dev-encryption-key-change-me-in-prod'),
  },
  http: {
    /** JSON and urlencoded body size (Express body-parser limit), e.g. 1mb */
    jsonBodyLimit: optional('HTTP_JSON_BODY_LIMIT', '1mb'),
    urlencodedBodyLimit: optional('HTTP_URLENCODED_BODY_LIMIT', '1mb'),
    /** 0 = disabled. Max time a request may run before HTTP 408 (does not apply to SSE). */
    requestTimeoutMs: parseInt(optional('HTTP_REQUEST_TIMEOUT_MS', '120000'), 10),
    webhookFetchTimeoutMs: parseInt(optional('HTTP_WEBHOOK_FETCH_TIMEOUT_MS', '15000'), 10),
    webhookMaxResponseBodyBytes: parseInt(optional('HTTP_WEBHOOK_MAX_RESPONSE_BYTES', '262144'), 10),
    telegramFetchTimeoutMs: parseInt(optional('HTTP_TELEGRAM_FETCH_TIMEOUT_MS', '20000'), 10),
  },
};
