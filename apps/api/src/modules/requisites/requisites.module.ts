import { Module } from '@nestjs/common';
import { RequisitesService } from './requisites.service';
import { RequisitesController } from './requisites.controller';
import { RequisiteGroupsService } from './requisite-groups.service';
import { RequisiteGroupsController } from './requisite-groups.controller';

@Module({
  controllers: [RequisitesController, RequisiteGroupsController],
  providers: [RequisitesService, RequisiteGroupsService],
  exports: [RequisitesService, RequisiteGroupsService],
})
export class RequisitesModule {}
