import { Module } from '@nestjs/common';
import { SettlementsService } from './settlements.service';
import { SettlementsController } from './settlements.controller';
import { BalanceTransactionsModule } from '../balance-transactions/balance-transactions.module';
import { TelegramModule } from '../telegram/telegram.module';
import { CurrenciesModule } from '../currencies/currencies.module';

@Module({
  imports: [BalanceTransactionsModule, TelegramModule, CurrenciesModule],
  controllers: [SettlementsController],
  providers: [SettlementsService],
  exports: [SettlementsService],
})
export class SettlementsModule {}
