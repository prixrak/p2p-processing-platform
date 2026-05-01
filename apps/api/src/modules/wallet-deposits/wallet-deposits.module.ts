import { Module } from '@nestjs/common';
import { PrismaModule } from '../../config/prisma.module';
import { BalanceTransactionsModule } from '../balance-transactions/balance-transactions.module';
import { CurrenciesModule } from '../currencies/currencies.module';
import { TrongridClient } from './trongrid.client';
import { WalletDepositsService } from './wallet-deposits.service';
import { WalletDepositEventsService } from './wallet-deposit-events.service';

@Module({
  imports: [PrismaModule, BalanceTransactionsModule, CurrenciesModule],
  providers: [TrongridClient, WalletDepositsService, WalletDepositEventsService],
  exports: [WalletDepositsService, WalletDepositEventsService, TrongridClient],
})
export class WalletDepositsModule {}
