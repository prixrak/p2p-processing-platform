import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { config } from '@p2p/config';
import { PrismaModule } from './config/prisma.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';
import { TelegramModule } from './modules/telegram/telegram.module';
import { TronDepositWorkerModule } from './modules/wallet-deposits/tron-deposit-worker.module';
import { Erc20DepositWorkerModule } from './modules/wallet-deposits/erc20-deposit-worker.module';
import { WalletSweepWorkerModule } from './modules/wallet-sweep/wallet-sweep-worker.module';
import { OpsAlertsModule } from './modules/ops-alerts/ops-alerts.module';

/**
 * Minimal module for background queue workers without an HTTP server.
 * Run via `npm run start:worker` (API HTTP uses `main.ts` instead).
 */
@Module({
  imports: [
    PrismaModule,
    BullModule.forRoot({
      connection: {
        host: config.redis.host,
        port: config.redis.port,
      },
    }),
    BullModule.registerQueue({ name: 'telegram' }),
    WebhooksModule,
    TelegramModule,
    TronDepositWorkerModule,
    Erc20DepositWorkerModule,
    WalletSweepWorkerModule,
    OpsAlertsModule,
  ],
})
export class WorkerModule {}
