import './load-env';
import { Logger } from '@nestjs/common';
import type { INestApplicationContext } from '@nestjs/common';
import { registerProcessHandlers } from './process-lifecycle';

let workerContext: INestApplicationContext | null = null;
registerProcessHandlers(() => workerContext);

async function main(): Promise<void> {
  const { hydrateFromAwsSecretsManager, startAwsSecretsRefreshLoop } =
    await import('./hydrate-aws-secrets');
  await hydrateFromAwsSecretsManager();
  const { assertSafeProductionEnvironment } = await import('./validate-production-env');
  assertSafeProductionEnvironment();
  startAwsSecretsRefreshLoop();

  const { bootstrapWorkerContext } = await import('./bootstrap-worker-context');
  workerContext = await bootstrapWorkerContext();
}

main().catch((err: unknown) => {
  const logger = new Logger('WorkerBootstrap');
  logger.error(err instanceof Error ? err.stack : String(err), 'Worker failed to start');
  process.exit(1);
});
