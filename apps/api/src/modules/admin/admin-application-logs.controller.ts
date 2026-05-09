import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@p2p/shared';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AdminApplicationLogsService } from './admin-application-logs.service';
import { ApplicationLogsQueryDto } from './dto/application-logs-query.dto';

@ApiTags('Admin Application Logs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.OWNER)
@Controller('admin/application-logs')
export class AdminApplicationLogsController {
  constructor(private readonly applicationLogs: AdminApplicationLogsService) {}

  @Get()
  @ApiOperation({ summary: 'Unified Pay-In / Pay-Out application logs (paginated)' })
  async list(@Query() query: ApplicationLogsQueryDto) {
    return this.applicationLogs.list(query);
  }

  @Get('summary')
  @ApiOperation({ summary: 'Aggregates for application-log charts (same filters as list)' })
  async summary(@Query() query: ApplicationLogsQueryDto) {
    return this.applicationLogs.summary(query);
  }

  @Get('meta')
  @ApiOperation({ summary: 'Filter dropdown metadata (merchants, traders, currencies, error codes)' })
  async meta() {
    return this.applicationLogs.filterMeta();
  }
}
