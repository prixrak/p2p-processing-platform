import { Module } from '@nestjs/common';
import { TradersService } from './traders.service';
import { TradersController } from './traders.controller';
import { TraderDashboardController } from './trader-dashboard.controller';

@Module({
  controllers: [TradersController, TraderDashboardController],
  providers: [TradersService],
  exports: [TradersService],
})
export class TradersModule {}
