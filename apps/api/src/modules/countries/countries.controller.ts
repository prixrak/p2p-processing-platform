import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CountriesService, CreateCountryDto, UpdateCountryDto } from './countries.service';
import { UserRole } from '@p2p/shared';

@ApiTags('Countries')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class CountriesController {
  constructor(private readonly svc: CountriesService) {}

  @Get('countries')
  @ApiOperation({ summary: 'List countries (public-ish, used by frontend)' })
  @ApiQuery({ name: 'activeOnly', required: false, type: Boolean })
  findAll(@Query('activeOnly') activeOnly?: string) {
    return this.svc.findAll(activeOnly === 'true');
  }

  @Post('admin/countries')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Create country' })
  create(@Body() dto: CreateCountryDto) {
    return this.svc.create(dto);
  }

  @Patch('admin/countries/:id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Update country' })
  update(@Param('id') id: string, @Body() dto: UpdateCountryDto) {
    return this.svc.update(id, dto);
  }
}
