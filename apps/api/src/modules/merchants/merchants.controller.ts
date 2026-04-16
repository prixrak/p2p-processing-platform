import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  ParseUUIDPipe,
  ParseIntPipe,
  DefaultValuePipe,
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { MerchantsService } from './merchants.service';
import { CreateMerchantDto, UpdateMerchantDto, GenerateApiKeysDto } from './dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Audited } from '../../common/decorators/audited.decorator';
import { AuditAction, AuditEntityType, UserRole } from '@p2p/shared';

@ApiTags('Merchants')
@ApiBearerAuth()
@Controller('merchants')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MerchantsController {
  constructor(private readonly merchantsService: MerchantsService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Create a new merchant' })
  @Audited(AuditAction.CREATE, AuditEntityType.Merchant)
  create(@Body() dto: CreateMerchantDto) {
    return this.merchantsService.create(dto);
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'List all merchants (paginated)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.merchantsService.findAll(page, limit);
  }

  @Get('by-user/:userId')
  @Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.MERCHANT)
  @ApiOperation({ summary: 'Get merchant by user ID' })
  findByUserId(
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentUser() user: { id: string; role: string },
  ) {
    if (user.role === UserRole.MERCHANT && userId !== user.id) {
      throw new ForbiddenException('You can only look up your own merchant by user ID');
    }
    return this.merchantsService.findByUserId(userId);
  }

  @Get('me')
  @Roles(UserRole.MERCHANT)
  @ApiOperation({ summary: 'Get own merchant profile' })
  findMy(@CurrentUser('merchantId') merchantId: string) {
    return this.merchantsService.findById(merchantId);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.MERCHANT)
  @ApiOperation({ summary: 'Get merchant by ID' })
  async findById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: { role: string; merchantId?: string },
  ) {
    if (user.role === UserRole.MERCHANT && user.merchantId !== id) {
      throw new ForbiddenException('Cannot access another merchant');
    }
    return this.merchantsService.findById(id);
  }

  @Put(':id')
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Update merchant' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMerchantDto,
  ) {
    return this.merchantsService.update(id, dto);
  }

  @Patch(':id/lock')
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Lock merchant' })
  @Audited(AuditAction.LOCK, AuditEntityType.Merchant)
  lock(@Param('id', ParseUUIDPipe) id: string) {
    return this.merchantsService.lock(id);
  }

  @Patch(':id/unlock')
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Unlock merchant' })
  @Audited(AuditAction.UNLOCK, AuditEntityType.Merchant)
  unlock(@Param('id', ParseUUIDPipe) id: string) {
    return this.merchantsService.unlock(id);
  }

  @Post(':id/api-keys')
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Generate new API key pair for a direction' })
  generateApiKeys(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: GenerateApiKeysDto,
  ) {
    return this.merchantsService.generateApiKeys(id, dto.direction);
  }

  @Post('api-keys/:keyId/regenerate')
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Regenerate an existing API key' })
  regenerateApiKey(@Param('keyId', ParseUUIDPipe) keyId: string) {
    return this.merchantsService.regenerateApiKey(keyId);
  }

  @Get(':id/balances')
  @Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.MERCHANT)
  @ApiOperation({ summary: 'Get merchant balances' })
  async getBalances(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: { role: string; merchantId?: string },
  ) {
    if (user.role === UserRole.MERCHANT && user.merchantId !== id) {
      throw new ForbiddenException('Cannot access another merchant balances');
    }
    return this.merchantsService.getBalances(id);
  }
}
