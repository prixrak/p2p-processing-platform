import { config, mergeRuntimeEnvFromObject } from '@p2p/config';

describe('mergeRuntimeEnvFromObject', () => {
  const envSnapshot = { ...process.env };

  afterEach(() => {
    process.env = { ...envSnapshot };
    mergeRuntimeEnvFromObject({});
  });

  it('overrides process.env until the merge map is replaced', () => {
    process.env.JWT_SECRET = 'from-env-only';
    expect(config.jwt.secret).toBe('from-env-only');

    mergeRuntimeEnvFromObject({ JWT_SECRET: 'from-aws-layer' });
    expect(config.jwt.secret).toBe('from-aws-layer');

    mergeRuntimeEnvFromObject({});
    expect(config.jwt.secret).toBe('from-env-only');
  });
});
