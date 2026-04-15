import { Module } from '@nestjs/common';
import { SettlementsService } from './settlements.service';
import { SettlementsController } from './settlements.controller';
import { BalanceTransactionsModule } from '../balance-transactions/balance-transactions.module';

@Module({
  imports: [BalanceTransactionsModule],
  controllers: [SettlementsController],
  providers: [SettlementsService],
  exports: [SettlementsService],
})
export class SettlementsModule {}
