import { Module } from '@nestjs/common';
import { CascadeService } from './cascade.service';

@Module({
  providers: [CascadeService],
  exports: [CascadeService],
})
export class CascadeModule {}
