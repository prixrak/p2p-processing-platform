import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '@p2p/shared';
import { MerchantDirectionsService } from './merchant-directions.service';
import {
  CreateMerchantDirectionDto,
  UpdateMerchantDirectionDto,
  UpsertCommissionTiersDto,
} from './dto/merchant-direction.dto';

@ApiTags('Merchant Directions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.OWNER)
@Controller('api/merchants/:merchantId/directions')
export class MerchantDirectionsController {
  constructor(private readonly svc: MerchantDirectionsService) {}

  @Get()
  @ApiOperation({ summary: 'List directions for a merchant' })
  findAll(@Param('merchantId') merchantId: string) {
    return this.svc.findByMerchant(merchantId);
  }

  @Post()
  @ApiOperation({ summary: 'Create direction for a merchant' })
  create(
    @Param('merchantId') merchantId: string,
    @Body() dto: CreateMerchantDirectionDto,
  ) {
    return this.svc.create(merchantId, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a merchant direction' })
  update(@Param('id') id: string, @Body() dto: UpdateMerchantDirectionDto) {
    return this.svc.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a merchant direction' })
  remove(@Param('id') id: string) {
    return this.svc.remove(id);
  }

  @Put(':id/tiers')
  @ApiOperation({ summary: 'Replace commission tiers for a direction' })
  upsertTiers(
    @Param('id') id: string,
    @Body() dto: UpsertCommissionTiersDto,
  ) {
    return this.svc.upsertTiers(id, dto);
  }
}
