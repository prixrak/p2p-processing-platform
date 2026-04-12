import { createHmac, timingSafeEqual } from 'crypto';
import { NONCE_VALIDITY_SECONDS } from '@p2p/shared';

export function generateHmacSignature(
  payload: string,
  secret: string,
): string {
  return createHmac('sha512', secret).update(payload).digest('hex');
}

export function verifyHmacSignature(
  payload: string,
  secret: string,
  signature: string,
): boolean {
  const expected = generateHmacSignature(payload, secret);

  if (expected.length !== signature.length) {
    return false;
  }

  return timingSafeEqual(
    Buffer.from(expected, 'hex'),
    Buffer.from(signature, 'hex'),
  );
}

export function generateBase64Payload(body: object | string): string {
  const raw = typeof body === 'string' ? body : JSON.stringify(body);
  return Buffer.from(raw, 'utf-8').toString('base64');
}

export function decodeBase64Payload(payload: string): string {
  return Buffer.from(payload, 'base64').toString('utf-8');
}

export function isNonceValid(
  nonce: number,
  validitySeconds: number = NONCE_VALIDITY_SECONDS,
): boolean {
  const now = Math.floor(Date.now() / 1000);
  const diff = Math.abs(now - nonce);
  return diff <= validitySeconds;
}
