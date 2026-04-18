import type { IncomingMessage } from 'http';
import {
  safeSerializeReq,
  shouldIgnoreHealthAccessLog,
  useHumanReadableConsole,
} from './pino-http.options';

function makeReq(overrides: Partial<IncomingMessage & { path?: string; originalUrl?: string }> = {}) {
  return {
    method: 'POST',
    url: '/api/external/v1/test',
    path: '/api/external/v1/test',
    headers: {
      host: 'localhost:3001',
      'x-api-key': 'pk_secret',
      'x-api-payload': 'c2VjcmV0',
      authorization: 'Bearer secret-token',
    },
    socket: { remoteAddress: '127.0.0.1', remotePort: 12345 },
    ...overrides,
  } as unknown as IncomingMessage;
}

describe('safeSerializeReq', () => {
  it('omits sensitive headers', () => {
    const out = safeSerializeReq(makeReq());
    expect(out.headers).not.toHaveProperty('x-api-key');
    expect(out.headers).not.toHaveProperty('authorization');
    expect(out.headers).toHaveProperty('host', 'localhost:3001');
  });
});

describe('useHumanReadableConsole', () => {
  it('is disabled when NODE_ENV is test (Jest default)', () => {
    expect(process.env.NODE_ENV).toBe('test');
    expect(useHumanReadableConsole()).toBe(false);
  });
});

describe('shouldIgnoreHealthAccessLog', () => {
  it('returns true for /api/health routes', () => {
    expect(shouldIgnoreHealthAccessLog(makeReq({ originalUrl: '/api/health' }))).toBe(true);
    expect(shouldIgnoreHealthAccessLog(makeReq({ originalUrl: '/api/health/ready' }))).toBe(true);
  });

  it('returns false for other routes', () => {
    expect(shouldIgnoreHealthAccessLog(makeReq({ originalUrl: '/api/payin/foo' }))).toBe(false);
  });
});
