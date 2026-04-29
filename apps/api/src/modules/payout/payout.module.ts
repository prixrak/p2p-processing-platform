import { Module } from '@nestjs/common';
import { PayoutService } from './payout.service';
import { PayoutRealtimeService } from './payout-realtime.service';
import { PayoutController, PayoutInternalController } from './payout.controller';
import { BalanceTransactionsModule } from '../balance-transactions/balance-transactions.module';
import { MerchantDirectionsModule } from '../merchant-directions/merchant-directions.module';

@Module({
  imports: [BalanceTransactionsModule, MerchantDirectionsModule],
  controllers: [PayoutController, PayoutInternalController],
  providers: [PayoutService, PayoutRealtimeService],
  exports: [PayoutService, PayoutRealtimeService],
})
export class PayoutModule {}
