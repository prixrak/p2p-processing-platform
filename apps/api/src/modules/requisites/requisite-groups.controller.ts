import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '@p2p/shared';
import { RequisiteGroupsService } from './requisite-groups.service';
import { CreateRequisiteGroupDto } from './dto/create-requisite-group.dto';
import { UpdateRequisiteGroupDto } from './dto/update-requisite-group.dto';

@ApiTags('Requisite Groups')
@ApiBearerAuth()
@Controller('requisite-groups')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.TRADER)
export class RequisiteGroupsController {
  constructor(private readonly requisiteGroupsService: RequisiteGroupsService) {}

  @Post('my')
  @ApiOperation({ summary: 'Create a requisite group (payment method bucket)' })
  createMy(
    @CurrentUser('traderId') traderId: string,
    @Body() dto: CreateRequisiteGroupDto,
  ) {
    return this.requisiteGroupsService.create(traderId, dto);
  }

  @Get('my')
  @ApiOperation({ summary: 'List grouped requisites (newest groups and rows first)' })
  @ApiQuery({ name: 'archived', required: false, description: 'true = archived tab' })
  @ApiQuery({
    name: 'includeInactiveRequisites',
    required: false,
    description: 'Include deactivated requisites inside each group',
  })
  listMy(
    @CurrentUser('traderId') traderId: string,
    @Query('archived') archived?: string,
    @Query('includeInactiveRequisites') includeInactiveRequisites?: string,
  ) {
    return this.requisiteGroupsService.findGroupedForTrader(
      traderId,
      archived === 'true',
      includeInactiveRequisites === 'true',
    );
  }

  @Patch('my/:id')
  @ApiOperation({ summary: 'Update requisite group (name, master active flag, payment method)' })
  updateMy(
    @CurrentUser('traderId') traderId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRequisiteGroupDto,
  ) {
    return this.requisiteGroupsService.update(traderId, id, dto);
  }

  @Patch('my/:id/restore')
  @ApiOperation({ summary: 'Move group from archive back to active list' })
  restoreMy(
    @CurrentUser('traderId') traderId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.requisiteGroupsService.restore(traderId, id);
  }

  @Delete('my/:id')
  @ApiOperation({ summary: 'Delete empty requisite group' })
  deleteMy(
    @CurrentUser('traderId') traderId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.requisiteGroupsService.delete(traderId, id);
  }
}
