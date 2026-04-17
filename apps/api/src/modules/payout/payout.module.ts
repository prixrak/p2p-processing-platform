import { Module } from '@nestjs/common';
import { PayoutService } from './payout.service';
import { PayoutRealtimeService } from './payout-realtime.service';
import { PayoutController, PayoutInternalController } from './payout.controller';
import { BalanceTransactionsModule } from '../balance-transactions/balance-transactions.module';

@Module({
  imports: [BalanceTransactionsModule],
  controllers: [PayoutController, PayoutInternalController],
  providers: [PayoutService, PayoutRealtimeService],
  exports: [PayoutService],
})
export class PayoutModule {}
