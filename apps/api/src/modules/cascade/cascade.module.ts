import { Module } from '@nestjs/common';
import { CascadeService } from './cascade.service';
import { CascadeRedisStateService } from './cascade-redis-state.service';
import { CurrenciesModule } from '../currencies/currencies.module';

@Module({
  imports: [CurrenciesModule],
  providers: [CascadeRedisStateService, CascadeService],
  exports: [CascadeRedisStateService, CascadeService],
})
export class CascadeModule {}
