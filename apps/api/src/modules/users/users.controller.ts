import {
  Controller,
  Get,
  Post,
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
} from '@nestjs/swagger';
import { AuditAction, AuditEntityType, UserRole } from '@p2p/shared';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Audited } from '../../common/decorators/audited.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'List users with filters, profile hints, and stats (admin/owner)' })
  async findAll(
    @Query() query: ListUsersQueryDto,
    @CurrentUser('role') viewerRole: UserRole,
  ) {
    return this.usersService.findAll(query, viewerRole);
  }

  @Post()
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Create user (admin/owner)' })
  @Audited(AuditAction.CREATE_USER, AuditEntityType.User)
  async create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto.email, dto.password, dto.role, {
      countryId: dto.countryId,
      payoutRate: dto.payoutRate,
      overdraftLimitUsdt: dto.overdraftLimitUsdt,
      payinRate: dto.payinRate,
      traderPayoutRate: dto.traderPayoutRate,
      payoutMinLimit: dto.payoutMinLimit,
      payoutMaxLimit: dto.payoutMaxLimit,
      processingMethod: dto.processingMethod,
      cascadeRatingMultiplier: dto.cascadeRatingMultiplier,
      referralPercent: dto.referralPercent,
      referralCurrency: dto.referralCurrency,
      merchantName: dto.merchantName,
    });
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Get user by ID (admin/owner)' })
  async findById(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.findById(id);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({
    summary: 'Update user (admin/owner)',
    description: 'Email, active flag, and merchant display name (for MERCHANT users). Role cannot be changed.',
  })
  @Audited(AuditAction.UPDATE_USER, AuditEntityType.User)
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() data: UpdateUserDto,
  ) {
    return this.usersService.update(id, {
      email: data.email,
      isActive: data.isActive,
      merchantName: data.merchantName,
    });
  }

  @Delete(':id/permanent')
  @Roles(UserRole.OWNER)
  @ApiOperation({
    summary: 'Permanently delete an inactive cabinet (owner only)',
    description:
      'Hard-deletes the user row and cascaded profiles when no orders or settlements block removal. Cabinet must be deactivated first.',
  })
  @Audited(AuditAction.DELETE_USER, AuditEntityType.User)
  async purge(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.purge(id);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Deactivate user (soft delete)' })
  @Audited(AuditAction.DEACTIVATE_USER, AuditEntityType.User)
  async deactivate(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.deactivate(id);
  }
}
