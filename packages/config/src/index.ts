/** In-memory env overrides (e.g. JSON from AWS Secrets Manager), merged over `process.env` on each read. */
let runtimeEnvOverrides: Record<string, string> = {};

/**
 * Merge flat key/value pairs into the runtime env layer used by {@link config}.
 * Replaces the whole override map each call so keys removed from the remote secret
 * fall back to `process.env` again.
 */
export function mergeRuntimeEnvFromObject(json: Record<string, unknown>): void {
  const next: Record<string, string> = {};
  for (const [k, v] of Object.entries(json)) {
    if (v === null || v === undefined) continue;
    if (typeof v === 'string') {
      next[k] = v;
    } else if (typeof v === 'number' || typeof v === 'boolean') {
      next[k] = String(v);
    }
  }
  runtimeEnvOverrides = next;
}

/** Effective value for an env key: runtime overrides (e.g. AWS Secrets Manager) then `process.env`. */
export function getEffectiveEnv(key: string): string | undefined {
  if (Object.prototype.hasOwnProperty.call(runtimeEnvOverrides, key)) {
    const o = runtimeEnvOverrides[key];
    if (o === '') return undefined;
    return o;
  }
  const v = process.env[key];
  if (v === undefined || v === '') return undefined;
  return v;
}

function optional(key: string, fallback: string): string {
  return getEffectiveEnv(key) ?? fallback;
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

export type OpsAlertSeverity = 'critical' | 'high' | 'medium' | 'low';

function parseOpsAlertSeverity(raw: string): OpsAlertSeverity {
  const v = raw.trim().toLowerCase();
  if (v === 'critical' || v === 'high' || v === 'medium' || v === 'low') {
    return v;
  }
  return 'high';
}

/**
 * Application configuration. Top-level properties are getters so values reflect runtime env updates
 * (e.g. after {@link mergeRuntimeEnvFromObject} runs in the AWS Secrets Manager refresh loop).
 */
export const config = {
  get database() {
    return {
      url: optional('DATABASE_URL', 'postgresql://postgres:postgres@localhost:5432/p2p'),
    };
  },
  get redis() {
    return {
      host: optional('REDIS_HOST', 'localhost'),
      port: parseInt(optional('REDIS_PORT', '6379'), 10),
      /** When set, must match `requirepass` on the Redis instance (see docker-compose.prod.yml). */
      password: optional('REDIS_PASSWORD', '').trim() || undefined,
    };
  },
  get binanceP2p() {
    return {
      pollMs: parseInt(optional('BINANCE_P2P_POLL_MS', '5000'), 10),
      primaryPairProbeVolume: parseInt(optional('BINANCE_P2P_VOLUME_UAH', '20000'), 10),
      skipTopAds: parseInt(optional('BINANCE_P2P_SKIP_TOP', '1'), 10),
      primaryPairRedisKey: optional('BINANCE_P2P_REDIS_KEY', 'binance:p2p:usdt_uah'),
      payTypes: optional('BINANCE_P2P_PAY_TYPES', 'Monobank'),
      secondaryPairPayTypes: optional('BINANCE_P2P_PAY_TYPES_KZT', ''),
      pollEnabled: optional('BINANCE_P2P_POLL_ENABLED', 'true') === 'true',
      staleAlertMinutes: parseInt(optional('BINANCE_P2P_STALE_ALERT_MINUTES', '15'), 10),
      secondaryPairProbeVolume: parseInt(optional('BINANCE_P2P_VOLUME_KZT', '100000'), 10),
      secondaryPairRedisKey: optional('BINANCE_P2P_REDIS_KEY_KZT', 'binance:p2p:usdt_kzt'),
    };
  },
  get ownerOps() {
    return {
      telegramChatId: optional('OWNER_OPS_TELEGRAM_CHAT_ID', ''),
    };
  },
  get opsEmail() {
    return {
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
      minSeverity: parseOpsAlertSeverity(optional('OPS_EMAIL_MIN_SEVERITY', 'high')),
      throttleCriticalSec: parseInt(optional('OPS_EMAIL_THROTTLE_CRITICAL_SEC', '3600'), 10),
      throttleHighSec: parseInt(optional('OPS_EMAIL_THROTTLE_HIGH_SEC', '1800'), 10),
      throttleMediumSec: parseInt(optional('OPS_EMAIL_THROTTLE_MEDIUM_SEC', '900'), 10),
      throttleLowSec: parseInt(optional('OPS_EMAIL_THROTTLE_LOW_SEC', '600'), 10),
    };
  },
  get tron() {
    return {
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
      trc20FetchLimit: parseInt(optional('TRON_TRC20_FETCH_LIMIT', '30'), 10),
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
      depositPollMode: optional('TRON_DEPOSIT_POLL_MODE', 'per_account') as
        | 'per_account'
        | 'contract_events',
      contractEventsPollSec: parseInt(optional('TRON_CONTRACT_EVENTS_POLL_SEC', '8'), 10),
      eventsFingerprintRedisKey: optional(
        'TRON_DEPOSIT_EVENTS_FINGERPRINT_KEY',
        'tron:deposit:events_fingerprint',
      ),
      contractEventsMaxPages: parseInt(optional('TRON_CONTRACT_EVENTS_MAX_PAGES', '12'), 10),
      resourceDelegationEnabled: optional('TRON_RESOURCE_DELEGATION_ENABLED', 'false') === 'true',
      resourceDelegatorPrivateKey: optional('TRON_RESOURCE_DELEGATOR_PRIVATE_KEY', ''),
      resourceDelegatorVaultSubPath: optional(
        'TRON_RESOURCE_DELEGATOR_VAULT_PATH',
        'tron/resource_delegator',
      ),
      delegateEnergyTrxSun: parseInt(optional('TRON_DELEGATE_ENERGY_TRX_SUN', '50000000'), 10),
      delegateEnergyWaitMs: parseInt(optional('TRON_DELEGATE_ENERGY_WAIT_MS', '2000'), 10),
    };
  },
  get sweep() {
    return {
      enabled: optional('TRON_SWEEP_ENABLED', 'false') === 'true',
      intervalMs: parseInt(optional('TRON_SWEEP_INTERVAL_MS', '300000'), 10),
      thresholdUsdt: parseFloat(optional('TRON_SWEEP_THRESHOLD_USDT', '1000')),
      coldWalletAddress: optional('TRON_SWEEP_COLD_WALLET_ADDRESS', ''),
      trxReserve: parseFloat(optional('TRON_SWEEP_TRX_RESERVE', '5')),
      lockTtlSec: parseInt(optional('TRON_SWEEP_LOCK_TTL_SEC', '120'), 10),
      lockKeyPrefix: optional('TRON_SWEEP_LOCK_KEY_PREFIX', 'sweep_lock:'),
      sweepCheckChannel: optional('TRON_SWEEP_CHECK_CHANNEL', 'sweep_check'),
      confirmPollMs: parseInt(optional('TRON_SWEEP_CONFIRM_POLL_MS', '4000'), 10),
      confirmMaxWaitMs: parseInt(optional('TRON_SWEEP_CONFIRM_MAX_MS', '180000'), 10),
      requireVaultSecpEngine: optional('TRON_SWEEP_REQUIRE_VAULT_SECP_ENGINE', 'false') === 'true',
    };
  },
  get internal() {
    return {
      apiKey: optional('INTERNAL_API_KEY', ''),
    };
  },
  get vault() {
    return {
      addr: optional('VAULT_ADDR', ''),
      roleId: optional('VAULT_ROLE_ID', ''),
      secretId: optional('VAULT_SECRET_ID', ''),
      walletRoleId:
        optional('VAULT_WALLET_ROLE_ID', '').trim() ||
        optional('VAULT_ROLE_ID', '').trim() ||
        optional('VAULT_SWEEP_ROLE_ID', '').trim(),
      walletSecretId:
        optional('VAULT_WALLET_SECRET_ID', '').trim() ||
        optional('VAULT_SECRET_ID', '').trim() ||
        optional('VAULT_SWEEP_SECRET_ID', '').trim(),
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
      transitSigningKeyName: optional('VAULT_TRANSIT_TRON_SIGNING_KEY', ''),
      tronSecpSignMount: optional('VAULT_TRON_SECP_SIGN_MOUNT', ''),
    };
  },
  get wallet() {
    return {
      autoProvisionTronOnTraderCreate:
        optional('WALLET_AUTO_PROVISION_TRON_ON_TRADER_CREATE', 'true') === 'true',
    };
  },
  get ethereum() {
    return {
      depositPollEnabled: optional('ETH_DEPOSIT_POLL_ENABLED', 'false') === 'true',
      rpcUrl: optional('ETH_RPC_URL', ''),
      usdtContract: optional('ETH_USDT_CONTRACT', '0xdAC17F958D2ee523a2206206994597C13D831ec7'),
      depositPollMs: parseInt(optional('ETH_DEPOSIT_POLL_MS', '25000'), 10),
      minConfirmations: parseInt(optional('ETH_USDT_MIN_CONFIRMATIONS', '12'), 10),
      minAmountUsdt: parseFloat(optional('ETH_DEPOSIT_MIN_USDT', '1')),
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
    };
  },
  get jwt() {
    return {
      secret: optional('JWT_SECRET', 'dev-jwt-secret-change-me'),
      accessExpiresIn: optional('JWT_ACCESS_EXPIRES', '15m'),
      refreshExpiresIn: optional('JWT_REFRESH_EXPIRES', '7d'),
    };
  },
  get s3() {
    const ep = optional('S3_ENDPOINT', '').trim() || undefined;
    return {
      bucket: optional('S3_BUCKET', 'p2p-files'),
      region: optional('S3_REGION', 'us-east-1'),
      endpoint: ep,
      accessKeyId: optional('S3_ACCESS_KEY_ID', 'minioadmin'),
      secretAccessKey: optional('S3_SECRET_ACCESS_KEY', 'minioadmin'),
      forcePathStyle: optional('S3_FORCE_PATH_STYLE', ep ? 'true' : 'false') === 'true',
    };
  },
  get telegram() {
    return {
      botToken: optional('TELEGRAM_BOT_TOKEN', ''),
    };
  },
  get app() {
    return {
      port: parseInt(optional('PORT', '3001'), 10),
      baseUrl: optional('BASE_URL', 'http://localhost:3001'),
      frontendUrl: optional('FRONTEND_URL', 'http://localhost:3000'),
      nodeEnv: optional('NODE_ENV', 'development'),
      encryptionKey: optional('ENCRYPTION_KEY', 'dev-encryption-key-change-me-in-prod'),
    };
  },
  get payinProvider() {
    return {
      baseUrl: optional('PAYIN_PROVIDER_BASE_URL', ''),
      apiKey: optional('PAYIN_PROVIDER_API_KEY', ''),
      reservePath: optional('PAYIN_PROVIDER_RESERVE_PATH', '/v1/payin/reserve'),
      timeoutMs: parseInt(optional('PAYIN_PROVIDER_TIMEOUT_MS', '8000'), 10),
      webhookSecret: optional('PAYIN_PROVIDER_WEBHOOK_SECRET', ''),
    };
  },
  get http() {
    return {
      jsonBodyLimit: optional('HTTP_JSON_BODY_LIMIT', '1mb'),
      urlencodedBodyLimit: optional('HTTP_URLENCODED_BODY_LIMIT', '1mb'),
      requestTimeoutMs: parseInt(optional('HTTP_REQUEST_TIMEOUT_MS', '120000'), 10),
      webhookFetchTimeoutMs: parseInt(optional('HTTP_WEBHOOK_FETCH_TIMEOUT_MS', '15000'), 10),
      webhookMaxResponseBodyBytes: parseInt(optional('HTTP_WEBHOOK_MAX_RESPONSE_BYTES', '262144'), 10),
      telegramFetchTimeoutMs: parseInt(optional('HTTP_TELEGRAM_FETCH_TIMEOUT_MS', '20000'), 10),
    };
  },
};
