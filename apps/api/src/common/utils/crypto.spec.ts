import { encryptSecret, decryptSecret } from './crypto';

describe('crypto', () => {
  it('encryptSecret and decryptSecret roundtrip', () => {
    const plain = 'merchant-api-secret-value';
    const enc = encryptSecret(plain);
    expect(enc).not.toContain(plain);
    expect(decryptSecret(enc)).toBe(plain);
  });

  it('produces different ciphertext for same plaintext (random IV)', () => {
    const plain = 'same';
    const a = encryptSecret(plain);
    const b = encryptSecret(plain);
    expect(a).not.toBe(b);
    expect(decryptSecret(a)).toBe(plain);
    expect(decryptSecret(b)).toBe(plain);
  });
});
