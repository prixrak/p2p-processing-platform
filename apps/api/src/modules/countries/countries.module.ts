import { Module } from '@nestjs/common';
import { CountriesService } from './countries.service';
import { CountriesController } from './countries.controller';
import { PrismaModule } from '../../config/prisma.module';
import { CurrenciesModule } from '../currencies/currencies.module';

@Module({
  imports: [PrismaModule, CurrenciesModule],
  controllers: [CountriesController],
  providers: [CountriesService],
  exports: [CountriesService],
})
export class CountriesModule {}
