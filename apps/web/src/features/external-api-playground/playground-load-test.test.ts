import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runJsonLoadTest, templateBodyForIteration } from './playground-load-test';

describe('templateBodyForIteration', () => {
  const base = 1_704_000_000;

  it('uses distinct nonces per index for the same base second', () => {
    const a = templateBodyForIteration({ nonce: 0 }, 0, base);
    const b = templateBodyForIteration({ nonce: 0 }, 1, base);
    expect(a.nonce).toBe(base);
    expect(b.nonce).toBe(base + 1);
  });

  it('rewrites request_id with an lt-* prefix containing index', () => {
    const row = templateBodyForIteration({ request_id: 'old', nonce: 1 }, 3, base);
    expect(typeof row.request_id).toBe('string');
    expect(String(row.request_id).startsWith(`lt-${base}-3-`)).toBe(true);
  });

  it('suffixes user_id when it is a non-empty string', () => {
    const row = templateBodyForIteration({ user_id: 'u1', nonce: 1 }, 7, base);
    expect(row.user_id).toBe(`u1-lt-7`);
  });
});

describe('runJsonLoadTest', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('rejects invalid totals', async () => {
    const r = await runJsonLoadTest({
      fetchUrl: 'http://test/x',
      signingPath: '/api/external/v1/payin/upload_order',
      template: {},
      useV2: false,
      publicKey: 'k',
      secret: 's',
      total: 0,
      concurrency: 10,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/1 and 500/);
  });

  it('honors concurrency and completes all requests when fetch succeeds', async () => {
    let concurrent = 0;
    let maxConcurrent = 0;
    const fetchMock = vi.fn(async () => {
      concurrent += 1;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise<void>((resolve) => {
        queueMicrotask(resolve);
      });
      concurrent -= 1;
      return new Response(JSON.stringify({ done: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const r = await runJsonLoadTest({
      fetchUrl: 'http://test/x',
      signingPath: '/api/external/v1/payin/upload_order',
      template: {
        request_id: 'seed',
        amount: 1,
        currency: 'TST',
      },
      useV2: false,
      publicKey: 'pk_test',
      secret: 'sk_test_secret_key_value',
      total: 20,
      concurrency: 4,
    });

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.summary.success2xx).toBe(20);
      expect(fetchMock).toHaveBeenCalledTimes(20);
    }
    expect(maxConcurrent).toBeLessThanOrEqual(4);
  });
});
