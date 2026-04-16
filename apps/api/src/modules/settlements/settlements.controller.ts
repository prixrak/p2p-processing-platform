import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Param,
  UseGuards,
  ParseIntPipe,
  ParseUUIDPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { SettlementsService } from './settlements.service';
import { CreateSettlementDto, FilterSettlementsDto } from './dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Audited } from '../../common/decorators/audited.decorator';
import { AuditAction, AuditEntityType, UserRole } from '@p2p/shared';

@ApiTags('Settlements')
@ApiBearerAuth()
@Controller('settlements')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.OWNER)
export class SettlementsController {
  constructor(private readonly settlementsService: SettlementsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a settlement (credit/debit trader balance)' })
  @Audited(AuditAction.CREATE, AuditEntityType.Settlement)
  create(
    @CurrentUser('id') adminId: string,
    @Body() dto: CreateSettlementDto,
  ) {
    return this.settlementsService.create(adminId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List settlements with filters' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  findAll(
    @Query() filters: FilterSettlementsDto,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.settlementsService.findAll(filters, page, limit);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get settlement details by ID' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.settlementsService.findOne(id);
  }
}
