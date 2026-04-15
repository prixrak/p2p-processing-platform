import { Module } from '@nestjs/common';
import { MerchantDirectionsService } from './merchant-directions.service';
import { MerchantDirectionsController } from './merchant-directions.controller';
import { PrismaModule } from '../../config/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [MerchantDirectionsController],
  providers: [MerchantDirectionsService],
  exports: [MerchantDirectionsService],
})
export class MerchantDirectionsModule {}
