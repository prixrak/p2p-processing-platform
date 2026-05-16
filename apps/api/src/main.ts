import './load-env';
import { Logger } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { registerProcessHandlers } from './process-lifecycle';

let nestApp: INestApplication | null = null;
registerProcessHandlers(() => nestApp);

async function main(): Promise<void> {
  const { hydrateFromAwsSecretsManager, startAwsSecretsRefreshLoop } =
    await import('./hydrate-aws-secrets');
  await hydrateFromAwsSecretsManager();
  const { assertSafeProductionEnvironment } = await import('./validate-production-env');
  assertSafeProductionEnvironment();
  startAwsSecretsRefreshLoop();

  const { bootstrapHttpApp } = await import('./bootstrap-http');
  nestApp = await bootstrapHttpApp();
}

main().catch((err: unknown) => {
  const logger = new Logger('Bootstrap');
  logger.error(err instanceof Error ? err.stack : String(err), 'Application failed to start');
  process.exit(1);
});
