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

/** Trimmed custom base URL; when unset, the SDK uses standard AWS partition endpoints. */
const customS3Endpoint = process.env.S3_ENDPOINT?.trim() || undefined;

export const config = {
  database: {
    url: optional('DATABASE_URL', 'postgresql://postgres:postgres@localhost:5432/p2p'),
  },
  redis: {
    host: optional('REDIS_HOST', 'localhost'),
    port: parseInt(optional('REDIS_PORT', '6379'), 10),
  },
  binanceP2p: {
    pollMs: parseInt(optional('BINANCE_P2P_POLL_MS', '5000'), 10),
    /** Probe-notional fiat volume for Binance P2P row filter on the primary cached pair (env BINANCE_P2P_VOLUME_UAH). */
    primaryPairProbeVolume: parseInt(optional('BINANCE_P2P_VOLUME_UAH', '20000'), 10),
    /** Rows treated as promoted / pinned at the top of the price-sorted list (skipped before picking 3–5). */
    skipTopAds: parseInt(optional('BINANCE_P2P_SKIP_TOP', '1'), 10),
    primaryPairRedisKey: optional('BINANCE_P2P_REDIS_KEY', 'binance:p2p:usdt_uah'),
    payTypes: optional('BINANCE_P2P_PAY_TYPES', 'Monobank'),
    /**
     * Comma-separated pay-type identifiers for USDT/KZT parser (same `/adv/search` `payTypes` field).
     * Empty = omit field (Binance treats as all payment methods — required because UAH defaults like Monobank return no rows on KZT).
     */
    secondaryPairPayTypes: optional('BINANCE_P2P_PAY_TYPES_KZT', ''),
    /** Set false on secondary processes to avoid duplicate Binance polling. */
    pollEnabled: optional('BINANCE_P2P_POLL_ENABLED', 'true') === 'true',
    /** If no successful Binance refresh for this many minutes, log warn and optionally notify owner. */
    staleAlertMinutes: parseInt(optional('BINANCE_P2P_STALE_ALERT_MINUTES', '15'), 10),
    /** Probe-notional fiat volume for the secondary cached pair (env BINANCE_P2P_VOLUME_KZT). */
    secondaryPairProbeVolume: parseInt(optional('BINANCE_P2P_VOLUME_KZT', '100000'), 10),
    secondaryPairRedisKey: optional('BINANCE_P2P_REDIS_KEY_KZT', 'binance:p2p:usdt_kzt'),
  },
  ownerOps: {
    /** Telegram chat_id for operational alerts (stale parser rate, etc.). Same bot as trader notifications. */
    telegramChatId: optional('OWNER_OPS_TELEGRAM_CHAT_ID', ''),
  },
  tron: {
    /** Run TRC-20 USDT deposit poller (typically in worker process only). */
    depositPollEnabled: optional('TRON_DEPOSIT_POLL_ENABLED', 'true') === 'true',
    depositPollMs: parseInt(optional('TRON_DEPOSIT_POLL_MS', '25000'), 10),
    apiKey: optional('TRONGRID_API_KEY', ''),
    baseUrl: optional('TRONGRID_BASE_URL', 'https://api.trongrid.io'),
    usdtTrc20Contract: optional(
      'TRON_USDT_TRC20_CONTRACT',
      'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
    ),
    minConfirmations: parseInt(optional('TRON_USDT_MIN_CONFIRMATIONS', '20'), 10),
    minAmountUsdt: parseFloat(optional('TRON_DEPOSIT_MIN_USDT', '1')),
    /** Ignore transfers below this (spam / dust). */
    trc20FetchLimit: parseInt(optional('TRON_TRC20_FETCH_LIMIT', '30'), 10),
    /** Alert owner (Telegram) if TronGrid poll has not succeeded within this window. */
    staleAlertMinutes: parseInt(optional('TRON_DEPOSIT_STALE_ALERT_MINUTES', '15'), 10),
    lastSuccessRedisKey: optional('TRON_DEPOSIT_LAST_SUCCESS_REDIS_KEY', 'tron:deposit:last_success_ms'),
    lastHeadBlockRedisKey: optional(
      'TRON_DEPOSIT_LAST_HEAD_BLOCK_REDIS_KEY',
      'tron:deposit:last_head_block',
    ),
    staleNotifyLockRedisKey: optional(
      'TRON_DEPOSIT_STALE_NOTIFY_LOCK_REDIS_KEY',
      'tron:deposit:stale_notify_lock',
    ),
  },
  /** Ethereum mainnet JSON-RPC (Infura / Alchemy). Required only when ERC-20 deposit polling is enabled. */
  ethereum: {
    depositPollEnabled: optional('ETH_DEPOSIT_POLL_ENABLED', 'false') === 'true',
    rpcUrl: optional('ETH_RPC_URL', ''),
    /** Mainnet USDT ERC-20 contract. */
    usdtContract: optional('ETH_USDT_CONTRACT', '0xdAC17F958D2ee523a2206206994597C13D831ec7'),
    depositPollMs: parseInt(optional('ETH_DEPOSIT_POLL_MS', '25000'), 10),
    minConfirmations: parseInt(optional('ETH_USDT_MIN_CONFIRMATIONS', '12'), 10),
    minAmountUsdt: parseFloat(optional('ETH_DEPOSIT_MIN_USDT', '1')),
    /** On first run (no Redis cursor), scan this many blocks behind head (cap avoids heavy backlog). */
    bootstrapBlocksBehind: parseInt(optional('ETH_DEPOSIT_BOOTSTRAP_BLOCKS_BEHIND', '4000'), 10),
    maxLogsBlockRange: parseInt(optional('ETH_GET_LOGS_MAX_BLOCK_RANGE', '2000'), 10),
    staleAlertMinutes: parseInt(optional('ETH_DEPOSIT_STALE_ALERT_MINUTES', '15'), 10),
    lastSuccessRedisKey: optional('ETH_DEPOSIT_LAST_SUCCESS_REDIS_KEY', 'eth:deposit:last_success_ms'),
    lastProcessedBlockRedisKey: optional(
      'ETH_DEPOSIT_LAST_PROCESSED_BLOCK_REDIS_KEY',
      'eth:deposit:last_processed_block',
    ),
    staleNotifyLockRedisKey: optional(
      'ETH_DEPOSIT_STALE_NOTIFY_LOCK_REDIS_KEY',
      'eth:deposit:stale_notify_lock',
    ),
  },
  jwt: {
    secret: optional('JWT_SECRET', 'dev-jwt-secret-change-me'),
    accessExpiresIn: optional('JWT_ACCESS_EXPIRES', '15m'),
    refreshExpiresIn: optional('JWT_REFRESH_EXPIRES', '7d'),
  },
  s3: {
    bucket: optional('S3_BUCKET', 'p2p-files'),
    region: optional('S3_REGION', 'us-east-1'),
    endpoint: customS3Endpoint,
    accessKeyId: optional('S3_ACCESS_KEY_ID', 'minioadmin'),
    secretAccessKey: optional('S3_SECRET_ACCESS_KEY', 'minioadmin'),
    /**
     * Path-style (`true`) suits MinIO / custom `endpoint`. AWS buckets normally need virtual-hosted
     * addressing (`false`); wrong style contributes to `PermanentRedirect` against real S3.
     */
    forcePathStyle:
      optional('S3_FORCE_PATH_STYLE', customS3Endpoint ? 'true' : 'false') === 'true',
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
