import { Module, Global } from '@nestjs/common';
import { PrismaModule } from '../../config/prisma.module';
import { TelegramModule } from '../telegram/telegram.module';
import { OpsAlertsModule } from '../ops-alerts/ops-alerts.module';
import { BinanceP2pClient } from './binance-p2p.client';
import { ExchangeRateService } from './exchange-rate.service';

@Global()
@Module({
  imports: [PrismaModule, TelegramModule, OpsAlertsModule],
  providers: [BinanceP2pClient, ExchangeRateService],
  exports: [ExchangeRateService],
})
export class ExchangeRateModule {}
