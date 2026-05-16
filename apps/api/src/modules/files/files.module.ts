import { Module } from '@nestjs/common';
import { FilesService } from './files.service';
import { FilesController } from './files.controller';
import { AuditModule } from '../audit/audit.module';
import { OpsAlertsModule } from '../ops-alerts/ops-alerts.module';

@Module({
  imports: [AuditModule, OpsAlertsModule],
  controllers: [FilesController],
  providers: [FilesService],
  exports: [FilesService],
})
export class FilesModule {}
