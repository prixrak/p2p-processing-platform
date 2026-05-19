import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AppealsService } from './appeals.service';
import { AppealFiltersDto, ResolveAppealDto } from './dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '@p2p/shared';

@ApiTags('Appeals')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('appeals')
export class AppealsController {
  constructor(private readonly appealsService: AppealsService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.SUPPORT, UserRole.TRADER)
  @ApiOperation({ summary: 'List all appeals with optional filters' })
  async findAll(
    @Query() filters: AppealFiltersDto,
    @CurrentUser() user: { role: string; traderId?: string },
  ) {
    const traderId = user.role === UserRole.TRADER ? user.traderId : undefined;
    return this.appealsService.findAll(filters, traderId);
  }

  @Get('order/:orderId')
  @Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.SUPPORT, UserRole.TRADER)
  @ApiOperation({ summary: 'Get appeals for a specific Pay-In order' })
  async findByOrderId(
    @Param('orderId') orderId: string,
    @CurrentUser() user: { role: string; traderId?: string },
  ) {
    const traderId = user.role === UserRole.TRADER ? user.traderId : undefined;
    return this.appealsService.findByOrderId(orderId, traderId);
  }

  @Get(':appealId/proofs')
  @Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.SUPPORT, UserRole.TRADER)
  @ApiOperation({ summary: 'Get proof file IDs for an appeal' })
  async getProofs(
    @Param('appealId') appealId: string,
    @CurrentUser() user: { role: string; traderId?: string },
  ) {
    const traderId = user.role === UserRole.TRADER ? user.traderId : undefined;
    return this.appealsService.getProofs(appealId, traderId);
  }

  @Patch(':appealId/resolve')
  @Roles(UserRole.TRADER, UserRole.SUPPORT, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Resolve or reject an appeal (trader on own orders; support/admin/owner)' })
  async resolve(
    @Param('appealId') appealId: string,
    @Body() dto: ResolveAppealDto,
    @CurrentUser() user: { role: string; traderId?: string | null },
  ) {
    return this.appealsService.resolve(appealId, dto.decision, {
      role: user.role,
      traderId: user.traderId,
    }, dto.actualAmount);
  }
}
