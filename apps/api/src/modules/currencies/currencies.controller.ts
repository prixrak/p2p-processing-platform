import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AuditAction, AuditEntityType, UserRole } from '@p2p/shared';
import { CurrenciesService } from './currencies.service';
import { CreateCurrencyDto, UpdateCurrencyDto } from './dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Audited } from '../../common/decorators/audited.decorator';

@ApiTags('Currencies')
@ApiBearerAuth()
@Controller('currencies')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CurrenciesController {
  constructor(private readonly currenciesService: CurrenciesService) {}

  @Get()
  @Roles(
    UserRole.ADMIN,
    UserRole.OWNER,
    UserRole.TRADER,
    UserRole.MERCHANT,
    UserRole.SUPPORT,
  )
  @ApiOperation({ summary: 'List currencies (reference data)' })
  findAll() {
    return this.currenciesService.findAll();
  }

  @Post()
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Create currency' })
  @Audited(AuditAction.CREATE, AuditEntityType.Currency)
  create(@Body() dto: CreateCurrencyDto) {
    return this.currenciesService.create(dto);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Update currency (e.g. activate/deactivate)' })
  @Audited(AuditAction.UPDATE, AuditEntityType.Currency)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCurrencyDto,
  ) {
    return this.currenciesService.update(id, dto);
  }
}
