import { Module } from '@nestjs/common';
import { PrismaModule } from '../../config/prisma.module';
import { BalanceTransactionsModule } from '../balance-transactions/balance-transactions.module';
import { WalletDepositsService } from './wallet-deposits.service';

@Module({
  imports: [PrismaModule, BalanceTransactionsModule],
  providers: [WalletDepositsService],
  exports: [WalletDepositsService],
})
export class WalletDepositsModule {}
