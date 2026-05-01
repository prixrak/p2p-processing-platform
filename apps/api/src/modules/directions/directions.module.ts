import { Module } from '@nestjs/common';
import { DirectionsService } from './directions.service';
import { DirectionsController } from './directions.controller';
import { CurrenciesModule } from '../currencies/currencies.module';

@Module({
  imports: [CurrenciesModule],
  controllers: [DirectionsController],
  providers: [DirectionsService],
  exports: [DirectionsService],
})
export class DirectionsModule {}
