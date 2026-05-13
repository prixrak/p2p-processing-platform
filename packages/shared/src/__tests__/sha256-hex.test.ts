import { createHash } from 'crypto';

import { fillMultiplierConfigFingerprint } from '../cascade-logic';
import { sha256HexUtf8 } from '../sha256-hex';

describe('sha256HexUtf8', () => {
  it('matches Node crypto for UTF-8 payloads', () => {
    const samples = ['', 'café', JSON.stringify({ tier: [{ from: 0, to: 1, multiplier: 2 }] })];
    for (const s of samples) {
      const expected = createHash('sha256').update(s, 'utf8').digest('hex');
      expect(sha256HexUtf8(s)).toBe(expected);
    }
  });
});

describe('fillMultiplierConfigFingerprint', () => {
  it('matches Node SHA-256 hex prefix fingerprint', () => {
    const raw = [{ from: 0, to: 0.6, multiplier: 1 }];
    const s = JSON.stringify(raw);
    const digestPrefix = createHash('sha256').update(s, 'utf8').digest('hex').slice(0, 32);
    expect(fillMultiplierConfigFingerprint(raw)).toBe(digestPrefix);
  });
});
