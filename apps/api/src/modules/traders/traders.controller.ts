import {
  Controller,
  Get,
  Post,
  Patch,
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
  ApiOkResponse,
} from '@nestjs/swagger';
import { TradersService } from './traders.service';
import { GetStatisticsDto, SetPayoutLimitsDto, TraderStatisticsResponseDto } from './dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '@p2p/shared';

@ApiTags('Traders')
@ApiBearerAuth()
@Controller('traders')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TradersController {
  constructor(private readonly tradersService: TradersService) {}

  @Get('me')
  @Roles(UserRole.TRADER)
  @ApiOperation({ summary: 'Get own trader profile' })
  getMyProfile(@CurrentUser('id') userId: string) {
    return this.tradersService.getProfileByUserId(userId);
  }

  @Get('me/balances')
  @Roles(UserRole.TRADER)
  @ApiOperation({ summary: 'Get own balances' })
  async getMyBalances(@CurrentUser('id') userId: string) {
    const profile = await this.tradersService.getProfileByUserId(userId);
    return this.tradersService.getBalances(profile.id);
  }

  @Get('me/statistics')
  @Roles(UserRole.TRADER)
  @ApiOperation({ summary: 'Get own statistics' })
  @ApiQuery({ name: 'period', required: false, enum: ['24h', '7d', '30d', '90d'] })
  @ApiQuery({ name: 'dateFrom', required: false })
  @ApiQuery({ name: 'dateTo', required: false })
  @ApiOkResponse({ type: TraderStatisticsResponseDto })
  async getMyStatistics(
    @CurrentUser('id') userId: string,
    @Query() dto: GetStatisticsDto,
  ) {
    const profile = await this.tradersService.getProfileByUserId(userId);
    return this.tradersService.getStatistics(profile.id, dto);
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'List all traders (paginated)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.tradersService.findAll(page, limit);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Get trader profile by ID' })
  getProfile(@Param('id', ParseUUIDPipe) id: string) {
    return this.tradersService.getProfile(id);
  }

  @Get(':id/balances')
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Get trader balances' })
  getBalances(@Param('id', ParseUUIDPipe) id: string) {
    return this.tradersService.getBalances(id);
  }

  @Get(':id/statistics')
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Get trader statistics' })
  @ApiQuery({ name: 'period', required: false, enum: ['24h', '7d', '30d', '90d'] })
  @ApiQuery({ name: 'dateFrom', required: false })
  @ApiQuery({ name: 'dateTo', required: false })
  @ApiOkResponse({ type: TraderStatisticsResponseDto })
  getStatistics(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() dto: GetStatisticsDto,
  ) {
    return this.tradersService.getStatistics(id, dto);
  }

  @Patch(':id/activate')
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Activate trader' })
  activate(@Param('id', ParseUUIDPipe) id: string) {
    return this.tradersService.activate(id);
  }

  @Patch(':id/deactivate')
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Deactivate trader' })
  deactivate(@Param('id', ParseUUIDPipe) id: string) {
    return this.tradersService.deactivate(id);
  }

  @Post(':id/payout-limits')
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({
    summary: 'Set payout order pool limits for a trader',
    description:
      'Set the min/max amount range of payout orders a trader can see in the pool. Use 0 for no limit.',
  })
  setPayoutLimits(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetPayoutLimitsDto,
  ) {
    return this.tradersService.setPayoutLimits(id, dto.minLimit, dto.maxLimit);
  }
}
