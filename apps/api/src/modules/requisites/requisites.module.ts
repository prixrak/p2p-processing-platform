import { Module } from '@nestjs/common';
import { RequisitesService } from './requisites.service';
import { RequisitesController } from './requisites.controller';

@Module({
  controllers: [RequisitesController],
  providers: [RequisitesService],
  exports: [RequisitesService],
})
export class RequisitesModule {}
