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

/**
 * TronGrid expects the HTTP origin only; callers append `/v1/...` and `/wallet/...`.
 * If `TRONGRID_BASE_URL` ends with `/v1`, URLs become `/v1/v1/...` and Nile/mainnet return HTTP 404.
 */
function normalizeTrongridBaseUrl(raw: string): string {
  let u = raw.trim().replace(/\/+$/, '');
  if (/\/v1$/i.test(u)) {
    u = u.replace(/\/v1$/i, '').replace(/\/+$/, '');
  }
  return u;
}

/** Trimmed custom base URL; when unset, the SDK uses standard AWS partition endpoints. */
const customS3Endpoint = process.env.S3_ENDPOINT?.trim() || undefined;

export type OpsAlertSeverity = 'critical' | 'high' | 'medium' | 'low';

function parseOpsAlertSeverity(raw: string): OpsAlertSeverity {
  const v = raw.trim().toLowerCase();
  if (v === 'critical' || v === 'high' || v === 'medium' || v === 'low') {
    return v;
  }
  return 'high';
}

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
  /** Optional SMTP ops alerts (e.g. Gmail app password). Queue-backed in API worker. */
  opsEmail: {
    recipientEmails: optional('OPS_ALERT_EMAILS', '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    smtpHost: optional('SMTP_HOST', 'smtp.gmail.com'),
    smtpPort: parseInt(optional('SMTP_PORT', '587'), 10),
    smtpSecure: optional('SMTP_SECURE', 'false') === 'true',
    smtpUser: optional('SMTP_USER', ''),
    smtpPass: optional('SMTP_PASS', ''),
    fromAddress: optional('OPS_EMAIL_FROM', ''),
    /** Minimum severity queued for email (`critical` > `high` > `medium` > `low`). */
    minSeverity: parseOpsAlertSeverity(optional('OPS_EMAIL_MIN_SEVERITY', 'high')),
    throttleCriticalSec: parseInt(optional('OPS_EMAIL_THROTTLE_CRITICAL_SEC', '3600'), 10),
    throttleHighSec: parseInt(optional('OPS_EMAIL_THROTTLE_HIGH_SEC', '1800'), 10),
    throttleMediumSec: parseInt(optional('OPS_EMAIL_THROTTLE_MEDIUM_SEC', '900'), 10),
    throttleLowSec: parseInt(optional('OPS_EMAIL_THROTTLE_LOW_SEC', '600'), 10),
  },
  tron: {
    /** Run TRC-20 USDT deposit poller (typically in worker process only). */
    depositPollEnabled: optional('TRON_DEPOSIT_POLL_ENABLED', 'true') === 'true',
    depositPollMs: parseInt(optional('TRON_DEPOSIT_POLL_MS', '25000'), 10),
    apiKey: optional('TRONGRID_API_KEY', ''),
    baseUrl: normalizeTrongridBaseUrl(optional('TRONGRID_BASE_URL', 'https://api.trongrid.io')),
    usdtTrc20Contract: optional(
      'TRON_USDT_TRC20_CONTRACT',
      'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
    ),
    minConfirmations: parseInt(optional('TRON_USDT_MIN_CONFIRMATIONS', '19'), 10),
    minAmountUsdt: parseFloat(optional('TRON_DEPOSIT_MIN_USDT', '1')),
    /** Per-page limit for `GET .../transactions/trc20` (TronGrid max 200). */
    trc20FetchLimit: parseInt(optional('TRON_TRC20_FETCH_LIMIT', '200'), 10),
    /** Pages of TRC-20 history to scan per address per poll / pre-sweep reconcile. */
    trc20FetchMaxPages: parseInt(optional('TRON_TRC20_FETCH_MAX_PAGES', '5'), 10),
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
    /**
     * `per_account`: poll TronGrid per deposit address.
     * `contract_events`: poll USDT contract Transfer events and filter by known addresses (TZ Monitor Service).
     */
    depositPollMode: optional('TRON_DEPOSIT_POLL_MODE', 'per_account') as
      | 'per_account'
      | 'contract_events',
    contractEventsPollSec: parseInt(optional('TRON_CONTRACT_EVENTS_POLL_SEC', '8'), 10),
    eventsFingerprintRedisKey: optional(
      'TRON_DEPOSIT_EVENTS_FINGERPRINT_KEY',
      'tron:deposit:events_fingerprint',
    ),
    /** Max TronGrid contract-event pages per poll (fingerprint pagination). */
    contractEventsMaxPages: parseInt(optional('TRON_CONTRACT_EVENTS_MAX_PAGES', '12'), 10),
    /** Delegate frozen ENERGY from an operator account to deposit addresses before sweep (TZ §3.4). */
    resourceDelegationEnabled: optional('TRON_RESOURCE_DELEGATION_ENABLED', 'false') === 'true',
    resourceDelegatorPrivateKey: optional('TRON_RESOURCE_DELEGATOR_PRIVATE_KEY', ''),
    /** KV v2 path segment under mount for `{ private_key: hex }` (e.g. `tron/resource_delegator`). */
    resourceDelegatorVaultSubPath: optional(
      'TRON_RESOURCE_DELEGATOR_VAULT_PATH',
      'tron/resource_delegator',
    ),
    /** Amount of TRX (in SUN) to delegate as ENERGY to the deposit address before USDT sweep. */
    delegateEnergyTrxSun: parseInt(optional('TRON_DELEGATE_ENERGY_TRX_SUN', '50000000'), 10),
    /** Pause after delegation tx so Energy is usable before USDT transfer. */
    delegateEnergyWaitMs: parseInt(optional('TRON_DELEGATE_ENERGY_WAIT_MS', '2000'), 10),
  },
  sweep: {
    enabled: optional('TRON_SWEEP_ENABLED', 'false') === 'true',
    /** TZ Sweep §2: cron every 5 minutes; values below 300000 ms are clamped in the worker. */
    intervalMs: parseInt(optional('TRON_SWEEP_INTERVAL_MS', '300000'), 10),
    thresholdUsdt: parseFloat(optional('TRON_SWEEP_THRESHOLD_USDT', '1000')),
    coldWalletAddress: optional('TRON_SWEEP_COLD_WALLET_ADDRESS', ''),
    trxReserve: parseFloat(optional('TRON_SWEEP_TRX_RESERVE', '5')),
    lockTtlSec: parseInt(optional('TRON_SWEEP_LOCK_TTL_SEC', '120'), 10),
    lockKeyPrefix: optional('TRON_SWEEP_LOCK_KEY_PREFIX', 'sweep_lock:'),
    sweepCheckChannel: optional('TRON_SWEEP_CHECK_CHANNEL', 'sweep_check'),
    /** Poll interval while waiting for sweep tx inclusion (TZ `sweep_log` confirmation). */
    confirmPollMs: parseInt(optional('TRON_SWEEP_CONFIRM_POLL_MS', '4000'), 10),
    confirmMaxWaitMs: parseInt(optional('TRON_SWEEP_CONFIRM_MAX_MS', '180000'), 10),
    /**
     * When true (recommended for TZ production), refuse to start sweep if VAULT_TRON_SECP_SIGN_MOUNT is unset.
     * Disable only for transitional environments still using KV+TronWeb signing.
     */
    requireVaultSecpEngine: optional('TRON_SWEEP_REQUIRE_VAULT_SECP_ENGINE', 'false') === 'true',
  },
  internal: {
    /** Protects /api/internal/*; empty in dev disables the guard (not allowed in production). */
    apiKey: optional('INTERNAL_API_KEY', ''),
  },
  vault: {
    addr: optional('VAULT_ADDR', ''),
    /** Fallback single AppRole when wallet/sweep-specific IDs are unset. */
    roleId: optional('VAULT_ROLE_ID', ''),
    secretId: optional('VAULT_SECRET_ID', ''),
    /** TZ Wallet Service policy (counter, master seed read, wallets/* create — no read of keys). */
    walletRoleId:
      optional('VAULT_WALLET_ROLE_ID', '').trim() ||
      optional('VAULT_ROLE_ID', '').trim() ||
      optional('VAULT_SWEEP_ROLE_ID', '').trim(),
    walletSecretId:
      optional('VAULT_WALLET_SECRET_ID', '').trim() ||
      optional('VAULT_SECRET_ID', '').trim() ||
      optional('VAULT_SWEEP_SECRET_ID', '').trim(),
    /** TZ Sweep Scheduler policy (wallets/* read, optional Transit). */
    sweepRoleId:
      optional('VAULT_SWEEP_ROLE_ID', '').trim() ||
      optional('VAULT_ROLE_ID', '').trim() ||
      optional('VAULT_WALLET_ROLE_ID', '').trim(),
    sweepSecretId:
      optional('VAULT_SWEEP_SECRET_ID', '').trim() ||
      optional('VAULT_SECRET_ID', '').trim() ||
      optional('VAULT_WALLET_SECRET_ID', '').trim(),
    kvMount: optional('VAULT_KV_MOUNT', 'secret'),
    walletCounterPath: optional('VAULT_WALLET_COUNTER_PATH', 'wallet_counter'),
    masterSeedPath: optional('VAULT_MASTER_SEED_PATH', 'master_seed'),
    walletPrefixPath: optional('VAULT_WALLET_PREFIX_PATH', 'wallets'),
    deriveLockKey: optional('WALLET_DERIVE_LOCK_REDIS_KEY', 'wallet:derive:lock'),
    deriveLockTtlSec: parseInt(optional('WALLET_DERIVE_LOCK_TTL_SEC', '30'), 10),
    /** Transit key name for signing experiments — see {@link HashicorpVaultTransitService}. */
    transitSigningKeyName: optional('VAULT_TRANSIT_TRON_SIGNING_KEY', ''),
    /**
     * Optional Vault secrets engine mount for TZ-style TRON sweep signing (`vault-plugin-tron-sign`).
     * OSS Vault Transit lacks secp256k1 — use this engine instead of KV + local signing.
     */
    tronSecpSignMount: optional('VAULT_TRON_SECP_SIGN_MOUNT', ''),
  },
  wallet: {
    autoProvisionTronOnTraderCreate:
      optional('WALLET_AUTO_PROVISION_TRON_ON_TRADER_CREATE', 'true') === 'true',
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
    /** Public @username without @ — shown in cabinets and deep links. */
    botUsername: optional(
      'TELEGRAM_BOT_USERNAME',
      optional('NEXT_PUBLIC_TELEGRAM_BOT_USERNAME', ''),
    ).replace(/^@/, ''),
    /** Public HTTPS webhook URL (e.g. https://api.example.com/api/telegram/bot/webhook). Empty = long polling. */
    webhookUrl: optional('TELEGRAM_WEBHOOK_URL', ''),
    /** Optional secret sent as X-Telegram-Bot-Api-Secret-Token when webhook is configured. */
    webhookSecret: optional('TELEGRAM_WEBHOOK_SECRET', ''),
  },
  app: {
    port: parseInt(optional('PORT', '3001'), 10),
    baseUrl: optional('BASE_URL', 'http://localhost:3001'),
    frontendUrl: optional('FRONTEND_URL', 'http://localhost:3000'),
    nodeEnv: optional('NODE_ENV', 'development'),
    encryptionKey: optional('ENCRYPTION_KEY', 'dev-encryption-key-change-me-in-prod'),
  },
  /** Optional external Pay-In provider bridge (TZ §5–6). */
  payinProvider: {
    baseUrl: optional('PAYIN_PROVIDER_BASE_URL', ''),
    apiKey: optional('PAYIN_PROVIDER_API_KEY', ''),
    /** POST path appended to base URL (leading slash required). */
    reservePath: optional('PAYIN_PROVIDER_RESERVE_PATH', '/v1/payin/reserve'),
    timeoutMs: parseInt(optional('PAYIN_PROVIDER_TIMEOUT_MS', '8000'), 10),
    /** HMAC-SHA256 secret for `POST /api/internal/payin-provider/webhook` body verification (hex digest in header). */
    webhookSecret: optional('PAYIN_PROVIDER_WEBHOOK_SECRET', ''),
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
