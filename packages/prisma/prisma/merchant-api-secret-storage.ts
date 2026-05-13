/**
 * AES-256-GCM encoding for MerchantApiKey.secretKeyHash.
 * Must stay byte-compatible with apps/api/src/common/utils/crypto.ts (decryptSecret).
 */

import { createCipheriv, randomBytes, createHash } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function deriveKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY ?? 'dev-encryption-key-change-me-in-prod';
  return createHash('sha256').update(raw).digest();
}

/** Plaintext signing secret → column value persisted in merchant_api_keys.secret_key_hash */
export function encryptMerchantApiSigningSecretForStorage(plaintext: string): string {
  const key = deriveKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

/** Detects plaintext SHA256-hex fingerprints that cannot be decrypted (early seed rows). */
export function isMerchantSecretSha256FingerprintOnly(value: string): boolean {
  return /^[a-f0-9]{64}$/i.test(value.trim());
}
