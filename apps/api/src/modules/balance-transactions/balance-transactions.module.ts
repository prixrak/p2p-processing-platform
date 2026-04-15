import { Module } from '@nestjs/common';
import { BalanceTransactionsService } from './balance-transactions.service';
import { BalanceTransactionsController } from './balance-transactions.controller';
import { PrismaModule } from '../../config/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [BalanceTransactionsController],
  providers: [BalanceTransactionsService],
  exports: [BalanceTransactionsService],
})
export class BalanceTransactionsModule {}
