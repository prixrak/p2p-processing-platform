import { Module } from '@nestjs/common';
import { PayoutService } from './payout.service';
import { PayoutController, PayoutInternalController } from './payout.controller';
import { BalanceTransactionsModule } from '../balance-transactions/balance-transactions.module';

@Module({
  imports: [BalanceTransactionsModule],
  controllers: [PayoutController, PayoutInternalController],
  providers: [PayoutService],
  exports: [PayoutService],
})
export class PayoutModule {}
