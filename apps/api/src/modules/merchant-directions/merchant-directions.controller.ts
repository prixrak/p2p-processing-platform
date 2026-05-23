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
  CreateMerchantBlockedAmountDto,
} from './dto/merchant-direction.dto';
import { Audited } from '../../common/decorators/audited.decorator';
import { AuditAction, AuditEntityType } from '@p2p/shared';

@ApiTags('Merchant Directions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.OWNER)
@Controller('merchants/:merchantId/directions')
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
  @Audited(AuditAction.UPDATE, AuditEntityType.Merchant)
  @ApiOperation({ summary: 'Update a merchant direction' })
  update(@Param('id') id: string, @Body() dto: UpdateMerchantDirectionDto) {
    return this.svc.update(id, dto);
  }

  @Delete(':id')
  @Audited(AuditAction.DELETE, AuditEntityType.Merchant)
  @ApiOperation({ summary: 'Delete a merchant direction' })
  remove(@Param('id') id: string) {
    return this.svc.remove(id);
  }

  @Post(':id/blocked-amounts')
  @Audited(AuditAction.CREATE, AuditEntityType.Merchant)
  @ApiOperation({ summary: 'Block an exact order amount for a merchant direction' })
  addBlockedAmount(
    @Param('id') id: string,
    @Body() dto: CreateMerchantBlockedAmountDto,
  ) {
    return this.svc.addBlockedAmount(id, dto);
  }

  @Delete(':id/blocked-amounts/:blockedAmountId')
  @Audited(AuditAction.DELETE, AuditEntityType.Merchant)
  @ApiOperation({ summary: 'Remove a blocked order amount' })
  removeBlockedAmount(
    @Param('id') id: string,
    @Param('blockedAmountId') blockedAmountId: string,
  ) {
    return this.svc.removeBlockedAmount(id, blockedAmountId);
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
