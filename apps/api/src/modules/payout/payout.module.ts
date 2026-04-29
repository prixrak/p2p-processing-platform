import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PayoutService } from './payout.service';
import { PayoutRealtimeService } from './payout-realtime.service';
import { PayoutPoolPromotionService } from './payout-pool-promotion.service';
import { PayoutController, PayoutInternalController, PayoutSpecialistInternalController } from './payout.controller';
import { BalanceTransactionsModule } from '../balance-transactions/balance-transactions.module';
import { MerchantDirectionsModule } from '../merchant-directions/merchant-directions.module';
import { TelegramModule } from '../telegram/telegram.module';

@Module({
  imports: [
    ScheduleModule,
    BalanceTransactionsModule,
    MerchantDirectionsModule,
    TelegramModule,
  ],
  controllers: [PayoutController, PayoutInternalController, PayoutSpecialistInternalController],
  providers: [PayoutService, PayoutRealtimeService, PayoutPoolPromotionService],
  exports: [PayoutService, PayoutRealtimeService],
})
export class PayoutModule {}
