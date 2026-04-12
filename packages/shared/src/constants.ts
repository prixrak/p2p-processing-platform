export const NONCE_VALIDITY_SECONDS = 300; // 5 minutes
export const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB
export const ALLOWED_FILE_TYPES = ['image/png', 'image/jpg', 'image/jpeg', 'application/pdf'];
export const WEBHOOK_MAX_RETRIES = 8;
export const WEBHOOK_RETRY_DELAYS_MS = [
  5_000,      // 5s
  30_000,     // 30s
  120_000,    // 2m
  600_000,    // 10m
  3_600_000,  // 1h
  3_600_000,  // 1h
  3_600_000,  // 1h
  3_600_000,  // 1h
];
export const AUTO_REFRESH_INTERVALS = [5, 10, 20] as const;
