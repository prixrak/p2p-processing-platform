import { Module } from '@nestjs/common';
import { CascadeService } from './cascade.service';
import { CascadeRedisStateService } from './cascade-redis-state.service';

@Module({
  providers: [CascadeRedisStateService, CascadeService],
  exports: [CascadeRedisStateService, CascadeService],
})
export class CascadeModule {}
