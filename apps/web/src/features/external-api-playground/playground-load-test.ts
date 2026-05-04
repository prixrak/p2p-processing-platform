import { ExternalApiHeaders } from '@p2p/shared';
import { buildSignedJsonRequest } from './hmac';

export type JsonLoadAttempt = {
  index: number;
  ok: boolean;
  status: number;
  latencyMs: number;
  bodyPreview: string;
};

/** Per-iteration payload: fresh nonce and optional request_id for upload-style bodies. */
export function templateBodyForIteration(
  template: Record<string, unknown>,
  index: number,
  unixBase: number,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...template };
  next.nonce = unixBase + index;
  const ridSuffix = crypto.randomUUID().slice(0, 8);
  if ('request_id' in next && typeof next.request_id === 'string') {
    next.request_id = `lt-${unixBase}-${index}-${ridSuffix}`;
  }
  if ('user_id' in next && typeof next.user_id === 'string' && next.user_id.trim() !== '') {
    next.user_id = `${next.user_id}-lt-${index}`;
  }
  return next;
}

export type JsonLoadSummary = {
  wallClockMs: number;
  success2xx: number;
  failed: number;
  statusBuckets: Record<string, number>;
  latencyMin: number;
  latencyMax: number;
  latencyAvg: number;
};

export async function runJsonLoadTest(opts: {
  fetchUrl: string;
  signingPath: string;
  template: Record<string, unknown>;
  useV2: boolean;
  publicKey: string;
  secret: string;
  total: number;
  concurrency: number;
  signal?: AbortSignal;
  onProgress?: (done: number, total: number) => void;
}): Promise<
  | { ok: true; attempts: JsonLoadAttempt[]; wallClockMs: number; summary: JsonLoadSummary }
  | { ok: false; error: string }
> {
  const { total, concurrency } = opts;
  if (!Number.isFinite(total) || total < 1 || total > 500) {
    return { ok: false, error: 'Total must be between 1 and 500.' };
  }
  if (!Number.isFinite(concurrency) || concurrency < 1 || concurrency > 100) {
    return { ok: false, error: 'Concurrency must be between 1 and 100.' };
  }

  const attempts: JsonLoadAttempt[] = new Array(total);
  let done = 0;
  const unixBase = Math.floor(Date.now() / 1000);

  const runOne = async (index: number) => {
    if (opts.signal?.aborted) {
      attempts[index] = {
        index,
        ok: false,
        status: 0,
        latencyMs: 0,
        bodyPreview: 'Aborted',
      };
      done += 1;
      opts.onProgress?.(done, total);
      return;
    }

    let bodyRecord: Record<string, unknown>;
    try {
      bodyRecord = templateBodyForIteration(opts.template, index, unixBase);
    } catch {
      attempts[index] = {
        index,
        ok: false,
        status: 0,
        latencyMs: 0,
        bodyPreview: 'Template clone failed',
      };
      done += 1;
      opts.onProgress?.(done, total);
      return;
    }

    let bodyString: string;
    let headers: Record<string, string>;
    try {
      const signed = await buildSignedJsonRequest({
        publicKey: opts.publicKey,
        secret: opts.secret,
        body: bodyRecord,
        apiUrl: opts.signingPath,
        useV2: opts.useV2,
      });
      bodyString = signed.bodyString;
      headers = signed.headers;
    } catch {
      attempts[index] = {
        index,
        ok: false,
        status: 0,
        latencyMs: 0,
        bodyPreview: 'Signing failed',
      };
      done += 1;
      opts.onProgress?.(done, total);
      return;
    }

    const t0 = performance.now();
    try {
      const res = await fetch(opts.fetchUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          [ExternalApiHeaders.API_KEY]: headers[ExternalApiHeaders.API_KEY]!,
          [ExternalApiHeaders.API_PAYLOAD]: headers[ExternalApiHeaders.API_PAYLOAD]!,
          [ExternalApiHeaders.API_SIGNATURE]: headers[ExternalApiHeaders.API_SIGNATURE]!,
        },
        body: bodyString,
        signal: opts.signal,
      });
      const raw = await res.text();
      const lat = Math.round(performance.now() - t0);
      let preview = raw.slice(0, 180);
      if (raw.length > 180) preview += '…';
      attempts[index] = {
        index,
        ok: res.ok,
        status: res.status,
        latencyMs: lat,
        bodyPreview: preview || '(empty)',
      };
    } catch (e) {
      const lat = Math.round(performance.now() - t0);
      attempts[index] = {
        index,
        ok: false,
        status: 0,
        latencyMs: lat,
        bodyPreview: e instanceof Error ? e.message : String(e),
      };
    }
    done += 1;
    opts.onProgress?.(done, total);
  };

  let cursor = 0;
  const worker = async () => {
    while (true) {
      const i = cursor;
      cursor += 1;
      if (i >= total) break;
      await runOne(i);
    }
  };

  const wallStart = performance.now();
  const workers = Math.min(concurrency, total);
  await Promise.all(Array.from({ length: workers }, () => worker()));
  const wallClockMs = Math.round(performance.now() - wallStart);

  return {
    ok: true as const,
    attempts,
    wallClockMs,
    summary: summarizeLoadTest(attempts, wallClockMs),
  };
}

export function summarizeLoadTest(attempts: JsonLoadAttempt[], wallClockMs: number): JsonLoadSummary {
  const okLat = attempts.filter((a) => a.latencyMs > 0);
  const lats = okLat.map((a) => a.latencyMs);
  const minL = lats.length ? Math.min(...lats) : 0;
  const maxL = lats.length ? Math.max(...lats) : 0;
  const avgL = lats.length ? Math.round(lats.reduce((s, x) => s + x, 0) / lats.length) : 0;
  const success2xx = attempts.filter((a) => a.status >= 200 && a.status < 300).length;
  const statusBuckets: Record<string, number> = {};
  for (const a of attempts) {
    const k = a.status === 0 ? '0/err' : String(a.status);
    statusBuckets[k] = (statusBuckets[k] ?? 0) + 1;
  }
  return {
    wallClockMs,
    success2xx,
    failed: attempts.length - success2xx,
    statusBuckets,
    latencyMin: minL,
    latencyMax: maxL,
    latencyAvg: avgL,
  };
}
