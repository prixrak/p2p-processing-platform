import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';
import path from 'node:path';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const includePlayground =
  process.env.NODE_ENV !== 'production' ||
  process.env.INCLUDE_EXTERNAL_PLAYGROUND === 'true';

const playgroundStub = path.join(
  process.cwd(),
  'src/features/external-api-playground.stub.tsx',
);

const nextConfig: NextConfig = {
  output: 'standalone',
  transpilePackages: ['@p2p/shared'],
  webpack: (config) => {
    if (!includePlayground) {
      config.resolve.alias = {
        ...config.resolve.alias,
        '@/features/external-api-playground': playgroundStub,
      };
    }
    return config;
  },
};

if (!includePlayground) {
  nextConfig.turbopack = {
    resolveAlias: {
      '@/features/external-api-playground': playgroundStub,
    },
  };
}

export default withNextIntl(nextConfig);
