import { Module } from '@nestjs/common';
import { BalanceTransactionsService } from './balance-transactions.service';
import { BalanceTransactionsController } from './balance-transactions.controller';
import { PrismaModule } from '../../config/prisma.module';
import { TelegramModule } from '../telegram/telegram.module';

@Module({
  imports: [PrismaModule, TelegramModule],
  controllers: [BalanceTransactionsController],
  providers: [BalanceTransactionsService],
  exports: [BalanceTransactionsService],
})
export class BalanceTransactionsModule {}
