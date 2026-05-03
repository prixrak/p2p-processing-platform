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
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { UserRole } from '@p2p/shared';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ReferralService } from './referral.service';
import { CreateReferralDto, UpdateReferralDto, LinkUserDto } from './dto';

/**
 * Staff endpoints for managing referral agents and referred-user links (admin and owner).
 */
@ApiTags('Referrals (Staff)')
@ApiBearerAuth()
@Controller('referrals')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReferralAdminController {
  constructor(private readonly referralService: ReferralService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'List all referral agents (paginated)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.referralService.findAll(page, limit);
  }

  @Post()
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Create a new referral agent (user + profile)' })
  create(@Body() dto: CreateReferralDto) {
    return this.referralService.create(dto);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Get referral agent profile with referred users' })
  findById(@Param('id', ParseUUIDPipe) id: string) {
    return this.referralService.findById(id);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Update referral agent (percent, currency)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateReferralDto,
  ) {
    return this.referralService.update(id, dto);
  }

  @Post(':id/link-user')
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Link an existing user to this referral agent' })
  linkUser(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: LinkUserDto,
  ) {
    return this.referralService.linkUser(id, dto.userId);
  }

  @Delete('users/:userId/unlink')
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Unlink a user from their referral agent' })
  unlinkUser(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.referralService.unlinkUser(userId);
  }
}

/**
 * Referral cabinet endpoints — for the REFERRAL role user themselves.
 */
@ApiTags('Referral Cabinet')
@ApiBearerAuth()
@Controller('referral/me')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReferralCabinetController {
  constructor(private readonly referralService: ReferralService) {}

  @Get()
  @Roles(UserRole.REFERRAL)
  @ApiOperation({ summary: 'Get own referral profile and referred users list' })
  getMyProfile(@CurrentUser('id') userId: string) {
    return this.referralService.getMyProfile(userId);
  }

  @Get('statistics')
  @Roles(UserRole.REFERRAL)
  @ApiOperation({
    summary: 'Get statistics of all referred traders and merchants with trading activity',
  })
  getMyStatistics(@CurrentUser('id') userId: string) {
    return this.referralService.getMyStatistics(userId);
  }
}
