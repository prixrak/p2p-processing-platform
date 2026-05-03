import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { TraderWalletsModule } from '../trader-wallets/trader-wallets.module';
import { CurrenciesModule } from '../currencies/currencies.module';
import { TradersModule } from '../traders/traders.module';

@Module({
  imports: [TraderWalletsModule, CurrenciesModule, TradersModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
