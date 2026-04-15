import {
  generateHmacSignature,
  verifyHmacSignature,
  generateBase64Payload,
  decodeBase64Payload,
  isNonceValid,
} from './hmac';
import { NONCE_VALIDITY_SECONDS } from '@p2p/shared';

describe('hmac utils', () => {
  const secret = 'test-hmac-secret-key-for-unit-tests';

  it('generateHmacSignature and verifyHmacSignature accept valid hex signature', () => {
    const payload = generateBase64Payload({ a: 1, nonce: 123 });
    const sig = generateHmacSignature(payload, secret);
    expect(sig).toMatch(/^[0-9a-f]{128}$/);
    expect(verifyHmacSignature(payload, secret, sig)).toBe(true);
  });

  it('verifyHmacSignature rejects wrong secret', () => {
    const payload = generateBase64Payload({ x: 'y' });
    const sig = generateHmacSignature(payload, secret);
    expect(verifyHmacSignature(payload, 'other-secret', sig)).toBe(false);
  });

  it('verifyHmacSignature rejects tampered signature', () => {
    const payload = generateBase64Payload({ x: 'y' });
    const sig = generateHmacSignature(payload, secret);
    const tampered = sig.slice(0, -1) + (sig.endsWith('0') ? '1' : '0');
    expect(verifyHmacSignature(payload, secret, tampered)).toBe(false);
  });

  it('generateBase64Payload and decodeBase64Payload roundtrip', () => {
    const obj = { request_id: 'r1', amount: 10, currency: 'UAH', nonce: 1700000000 };
    const b64 = generateBase64Payload(obj);
    expect(decodeBase64Payload(b64)).toBe(JSON.stringify(obj));
  });

  it('isNonceValid returns true for current time within window', () => {
    const now = Math.floor(Date.now() / 1000);
    expect(isNonceValid(now, NONCE_VALIDITY_SECONDS)).toBe(true);
  });

  it('isNonceValid returns false when outside window', () => {
    const ancient = Math.floor(Date.now() / 1000) - NONCE_VALIDITY_SECONDS - 60;
    expect(isNonceValid(ancient, NONCE_VALIDITY_SECONDS)).toBe(false);
  });
});
