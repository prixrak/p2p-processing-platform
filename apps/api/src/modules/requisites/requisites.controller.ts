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
  ParseIntPipe,
  DefaultValuePipe,
  ForbiddenException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { RequisitesService } from './requisites.service';
import { CreateRequisiteDto, UpdateRequisiteDto } from './dto';
import { AuditService } from '../audit/audit.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Audited } from '../../common/decorators/audited.decorator';
import { AuditAction, AuditEntityType, UserRole } from '@p2p/shared';

@ApiTags('Requisites')
@ApiBearerAuth()
@Controller('requisites')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RequisitesController {
  constructor(
    private readonly requisitesService: RequisitesService,
    private readonly auditService: AuditService,
  ) {}

  // ─── Trader self-management ───

  @Post('my')
  @Roles(UserRole.TRADER)
  @ApiOperation({ summary: 'Create own requisite (trader)' })
  @Audited(AuditAction.CREATE, AuditEntityType.Requisite)
  async createMy(
    @CurrentUser('traderId') traderId: string,
    @Body() dto: CreateRequisiteDto,
  ) {
    return this.requisitesService.create(traderId, dto);
  }

  @Get('my')
  @Roles(UserRole.TRADER)
  @ApiOperation({ summary: 'List own requisites (trader)' })
  @ApiQuery({
    name: 'includeInactive',
    required: false,
    description: 'Include deactivated requisites (to re-enable or review limits)',
  })
  getMyRequisites(
    @CurrentUser('traderId') traderId: string,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.requisitesService.findByTraderId(
      traderId,
      includeInactive === 'true',
    );
  }

  // ─── Admin endpoints ───

  @Post('trader/:traderId')
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Create requisite for a trader (admin)' })
  @Audited(AuditAction.CREATE, AuditEntityType.Requisite)
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

  @Get(':id/history')
  @Roles(UserRole.TRADER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Audit history for a requisite' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getRequisiteHistory(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: { role: string; traderId?: string },
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    const requisite = await this.requisitesService.findById(id);
    this.assertOwnership(user, requisite.traderId);
    const capped = Math.min(Math.max(limit, 1), 100);
    return this.auditService.findAll({
      page,
      limit: capped,
      entityType: AuditEntityType.Requisite,
      entityId: id,
    });
  }

  @Get(':id')
  @Roles(UserRole.TRADER, UserRole.ADMIN, UserRole.OWNER, UserRole.SUPPORT)
  @ApiOperation({ summary: 'Get requisite by ID' })
  async findById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: { role: string; traderId?: string },
  ) {
    const requisite = await this.requisitesService.findById(id);
    this.assertOwnership(user, requisite.traderId);
    return requisite;
  }

  @Put(':id')
  @Roles(UserRole.TRADER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Update requisite' })
  @Audited(AuditAction.UPDATE, AuditEntityType.Requisite)
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRequisiteDto,
    @CurrentUser() user: { id: string; role: string; traderId?: string },
  ) {
    const requisite = await this.requisitesService.findById(id);
    this.assertOwnership(user, requisite.traderId);
    return this.requisitesService.update(id, dto, { id: user.id, role: user.role });
  }

  @Delete(':id')
  @Roles(UserRole.TRADER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Delete requisite' })
  @Audited(AuditAction.DELETE, AuditEntityType.Requisite)
  async delete(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: { role: string; traderId?: string },
  ) {
    const requisite = await this.requisitesService.findById(id);
    this.assertOwnership(user, requisite.traderId);
    return this.requisitesService.delete(id);
  }

  @Patch(':id/activate')
  @Roles(UserRole.TRADER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Activate requisite' })
  @Audited(AuditAction.ACTIVATE, AuditEntityType.Requisite)
  async activate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: { role: string; traderId?: string },
  ) {
    const requisite = await this.requisitesService.findById(id);
    this.assertOwnership(user, requisite.traderId);
    return this.requisitesService.activate(id);
  }

  @Patch(':id/deactivate')
  @Roles(UserRole.TRADER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Deactivate requisite' })
  @Audited(AuditAction.DEACTIVATE, AuditEntityType.Requisite)
  async deactivate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: { role: string; traderId?: string },
  ) {
    const requisite = await this.requisitesService.findById(id);
    this.assertOwnership(user, requisite.traderId);
    return this.requisitesService.deactivate(id);
  }

  private assertOwnership(user: { role: string; traderId?: string }, requisiteTraderId: string) {
    if (user.role === UserRole.TRADER && user.traderId !== requisiteTraderId) {
      throw new ForbiddenException('You can only manage your own requisites');
    }
  }
}
