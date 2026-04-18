import { Logger } from '@nestjs/common';
import type { INestApplicationContext } from '@nestjs/common';
import { config } from '@p2p/config';

const logger = new Logger('ProcessLifecycle');

let shuttingDown = false;

async function gracefulExit(
  getApp: () => INestApplicationContext | null,
  exitCode: number,
): Promise<void> {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;

  const app = getApp();
  try {
    if (app) {
      await app.close();
    }
  } catch (err) {
    logger.error(err instanceof Error ? err.stack : String(err));
  } finally {
    process.exit(exitCode);
  }
}

/**
 * Register before Nest bootstrap. Pass a getter so the app reference exists after listen().
 * On critical process errors, closes the app (BullMQ workers, Prisma, Redis) then exits.
 */
export function registerProcessHandlers(getApp: () => INestApplicationContext | null): void {
  process.on('unhandledRejection', (reason: unknown) => {
    const msg = reason instanceof Error ? reason.stack : String(reason);
    logger.error(`unhandledRejection: ${msg}`);
    if (config.app.nodeEnv === 'production') {
      void gracefulExit(getApp, 1);
    }
  });

  process.on('uncaughtException', (error: Error) => {
    logger.error(`uncaughtException: ${error.stack ?? error.message}`);
    void gracefulExit(getApp, 1);
  });
}
