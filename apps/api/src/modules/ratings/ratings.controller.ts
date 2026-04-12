import {
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '@p2p/shared';
import { RatingsService } from './ratings.service';

@ApiTags('Ratings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('ratings')
export class RatingsController {
  constructor(private readonly ratingsService: RatingsService) {}

  @Get('traders')
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Get trader ratings' })
  @ApiQuery({ name: 'period', required: false, enum: ['7d', '30d', '90d'] })
  async getTraderRatings(@Query('period') period?: '7d' | '30d' | '90d') {
    return this.ratingsService.getTraderRatings(period ?? '30d');
  }

  @Get('requisites')
  @Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.TRADER)
  @ApiOperation({ summary: 'Get requisite ratings' })
  @ApiQuery({ name: 'traderId', required: false })
  async getRequisiteRatings(
    @Query('traderId') traderId?: string,
    @CurrentUser() user?: { role: string; traderId?: string },
  ) {
    const targetTraderId = user?.role === UserRole.TRADER
      ? user.traderId
      : traderId;
    return this.ratingsService.getRequisiteRatings(targetTraderId);
  }
}
