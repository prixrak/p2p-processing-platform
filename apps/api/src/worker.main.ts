import './load-env';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { INestApplicationContext } from '@nestjs/common';
import { WorkerModule } from './worker.module';
import { registerProcessHandlers } from './process-lifecycle';

let workerContext: INestApplicationContext | null = null;
registerProcessHandlers(() => workerContext);

async function bootstrapWorker(): Promise<void> {
  const app = await NestFactory.createApplicationContext(WorkerModule, {
    bufferLogs: false,
  });
  workerContext = app;
  app.enableShutdownHooks(['SIGTERM', 'SIGINT']);

  const logger = new Logger('WorkerBootstrap');
  logger.log('Queue workers running (webhook, telegram); no HTTP server.');
}

bootstrapWorker().catch((err: unknown) => {
  const logger = new Logger('WorkerBootstrap');
  logger.error(err instanceof Error ? err.stack : String(err), 'Worker failed to start');
  process.exit(1);
});
