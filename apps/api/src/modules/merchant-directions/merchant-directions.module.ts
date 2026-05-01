import { Module } from '@nestjs/common';
import { MerchantDirectionsService } from './merchant-directions.service';
import { MerchantDirectionsController } from './merchant-directions.controller';
import { PrismaModule } from '../../config/prisma.module';
import { CurrenciesModule } from '../currencies/currencies.module';

@Module({
  imports: [PrismaModule, CurrenciesModule],
  controllers: [MerchantDirectionsController],
  providers: [MerchantDirectionsService],
  exports: [MerchantDirectionsService],
})
export class MerchantDirectionsModule {}
