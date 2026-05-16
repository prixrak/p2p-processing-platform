import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { INestApplicationContext } from '@nestjs/common';
import { WorkerModule } from './worker.module';

export async function bootstrapWorkerContext(): Promise<INestApplicationContext> {
  const app = await NestFactory.createApplicationContext(WorkerModule, {
    bufferLogs: false,
  });
  app.enableShutdownHooks(['SIGTERM', 'SIGINT']);

  const logger = new Logger('WorkerBootstrap');
  logger.log('Queue workers running (webhook, telegram); no HTTP server.');
  return app;
}
