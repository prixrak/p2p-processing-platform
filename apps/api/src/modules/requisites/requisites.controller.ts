import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Param,
  Body,
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
import { RequisitesService } from './requisites.service';
import { CreateRequisiteDto, UpdateRequisiteDto } from './dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Audited } from '../../common/decorators/audited.decorator';
import { UserRole } from '@p2p/shared';

@ApiTags('Requisites')
@ApiBearerAuth()
@Controller('requisites')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RequisitesController {
  constructor(private readonly requisitesService: RequisitesService) {}

  // ─── Trader self-management ───

  @Post('my')
  @Roles(UserRole.TRADER)
  @ApiOperation({ summary: 'Create own requisite (trader)' })
  @Audited('CREATE', 'Requisite')
  async createMy(
    @CurrentUser('traderId') traderId: string,
    @Body() dto: CreateRequisiteDto,
  ) {
    return this.requisitesService.create(traderId, dto);
  }

  @Get('my')
  @Roles(UserRole.TRADER)
  @ApiOperation({ summary: 'List own requisites (trader)' })
  getMyRequisites(@CurrentUser('traderId') traderId: string) {
    return this.requisitesService.findByTraderId(traderId);
  }

  // ─── Admin endpoints ───

  @Post('trader/:traderId')
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Create requisite for a trader (admin)' })
  @Audited('CREATE', 'Requisite')
  create(
    @Param('traderId', ParseUUIDPipe) traderId: string,
    @Body() dto: CreateRequisiteDto,
  ) {
    return this.requisitesService.create(traderId, dto);
  }

  @Get('trader/:traderId')
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'List requisites for a trader (admin)' })
  @ApiQuery({ name: 'includeInactive', required: false, type: Boolean })
  findByTraderId(
    @Param('traderId', ParseUUIDPipe) traderId: string,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.requisitesService.findByTraderId(
      traderId,
      includeInactive === 'true',
    );
  }

  @Get(':id')
  @Roles(UserRole.TRADER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Get requisite by ID' })
  findById(@Param('id', ParseUUIDPipe) id: string) {
    return this.requisitesService.findById(id);
  }

  @Put(':id')
  @Roles(UserRole.TRADER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Update requisite' })
  @Audited('UPDATE', 'Requisite')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRequisiteDto,
  ) {
    return this.requisitesService.update(id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.TRADER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Delete requisite' })
  @Audited('DELETE', 'Requisite')
  delete(@Param('id', ParseUUIDPipe) id: string) {
    return this.requisitesService.delete(id);
  }

  @Patch(':id/activate')
  @Roles(UserRole.TRADER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Activate requisite' })
  @Audited('ACTIVATE', 'Requisite')
  activate(@Param('id', ParseUUIDPipe) id: string) {
    return this.requisitesService.activate(id);
  }

  @Patch(':id/deactivate')
  @Roles(UserRole.TRADER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Deactivate requisite' })
  @Audited('DEACTIVATE', 'Requisite')
  deactivate(@Param('id', ParseUUIDPipe) id: string) {
    return this.requisitesService.deactivate(id);
  }
}
