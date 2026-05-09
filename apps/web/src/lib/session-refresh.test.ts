import { describe, expect, it } from 'vitest';
import {
  accessTokenExpiryMs,
  shouldProactivelyRefreshAccess,
} from './session-refresh';

function fakeAccessJwt(expSec: number): string {
  const payload = Buffer.from(JSON.stringify({ exp: expSec }), 'utf8').toString(
    'base64url',
  );
  return `x.${payload}.y`;
}

describe('session-refresh helpers', () => {
  it('accessTokenExpiryMs reads exp in seconds as ms', () => {
    const token = fakeAccessJwt(1_700_000_000);
    expect(accessTokenExpiryMs(token)).toBe(1_700_000_000_000);
  });

  it('shouldProactivelyRefreshAccess is false when no refresh token', () => {
    const token = fakeAccessJwt(2_000_000_000);
    expect(
      shouldProactivelyRefreshAccess(token, null, 1_000_000_000_000, 90_000),
    ).toBe(false);
  });

  it('shouldProactivelyRefreshAccess is true when access missing but refresh exists', () => {
    expect(
      shouldProactivelyRefreshAccess(null, 'rt', 1_000_000_000_000, 90_000),
    ).toBe(true);
  });

  it('shouldProactivelyRefreshAccess respects leeway before exp', () => {
    const expSec = 1_700_000_000;
    const token = fakeAccessJwt(expSec);
    const expMs = expSec * 1000;
    // 60s left — inside 90s leeway
    expect(
      shouldProactivelyRefreshAccess(token, 'rt', expMs - 60_000, 90_000),
    ).toBe(true);
    // 120s left — outside leeway
    expect(
      shouldProactivelyRefreshAccess(token, 'rt', expMs - 120_000, 90_000),
    ).toBe(false);
  });
});
