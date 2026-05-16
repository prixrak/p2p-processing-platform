import { Module } from '@nestjs/common';
import { PrismaModule } from '../../config/prisma.module';
import { TelegramModule } from '../telegram/telegram.module';
import { OpsAlertsModule } from '../ops-alerts/ops-alerts.module';
import { WalletDepositsModule } from './wallet-deposits.module';
import { TronDepositPollerService } from './tron-deposit-poller.service';

/**
 * Background Tron USDT deposit polling. Import only from {@link WorkerModule}, not from HTTP API.
 */
@Module({
  imports: [PrismaModule, WalletDepositsModule, TelegramModule, OpsAlertsModule],
  providers: [TronDepositPollerService],
})
export class TronDepositWorkerModule {}
