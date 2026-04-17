import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const playgroundRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, playgroundRoot, '');
  const target = env.EXTERNAL_PLAYGROUND_API_TARGET ?? 'http://localhost:3001';

  return {
    plugins: [react()],
    server: {
      port: 5174,
      proxy: {
        '/api': {
          target,
          changeOrigin: true,
        },
      },
    },
    resolve: {
      alias: {
        '@p2p/shared': path.resolve(playgroundRoot, '../../packages/shared/src/index.ts'),
      },
    },
    optimizeDeps: {
      include: ['@p2p/shared'],
    },
  };
});
