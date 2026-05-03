import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { RequisitesModule } from '../requisites/requisites.module';
import { MaintenanceService } from './maintenance.service';

@Module({
  imports: [ScheduleModule.forRoot(), RequisitesModule],
  providers: [MaintenanceService],
})
export class MaintenanceModule {}
