import { assertSafeProductionEnvironment } from './validate-production-env';

describe('assertSafeProductionEnvironment', () => {
  let snapshot: NodeJS.ProcessEnv;

  beforeEach(() => {
    snapshot = { ...process.env };
  });

  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in snapshot)) {
        delete process.env[key];
      }
    }
    Object.assign(process.env, snapshot);
  });

  it('no-ops when NODE_ENV is not production', () => {
    delete process.env.NODE_ENV;
    expect(() => assertSafeProductionEnvironment()).not.toThrow();
  });

  it('throws when production JWT_SECRET uses a dev default', () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'dev-jwt-secret-change-me-in-production';
    process.env.ENCRYPTION_KEY = 'x'.repeat(64);
    process.env.INTERNAL_API_KEY = 'internal-key-at-least-ten-chars-longish';
    process.env.DATABASE_URL = 'postgresql://u:p@db.example.com:5432/p2p';
    process.env.BASE_URL = 'https://api.example.com';
    process.env.FRONTEND_URL = 'https://example.com';

    expect(() => assertSafeProductionEnvironment()).toThrow(/JWT_SECRET/);
  });

  it('passes with strong production-like env', () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'a'.repeat(64);
    process.env.ENCRYPTION_KEY = 'b'.repeat(64);
    process.env.INTERNAL_API_KEY = 'c'.repeat(32);
    process.env.DATABASE_URL = 'postgresql://u:p@db.example.com:5432/p2p';
    process.env.BASE_URL = 'https://api.example.com';
    process.env.FRONTEND_URL = 'https://example.com';

    expect(() => assertSafeProductionEnvironment()).not.toThrow();
  });
});
