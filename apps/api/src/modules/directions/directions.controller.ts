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
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { DirectionsService } from './directions.service';
import { CreateDirectionDto, UpdateDirectionDto } from './dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole, DirectionType } from '@p2p/shared';

@ApiTags('Directions')
@ApiBearerAuth()
@Controller('directions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DirectionsController {
  constructor(private readonly directionsService: DirectionsService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.TRADER, UserRole.MERCHANT)
  @ApiOperation({ summary: 'List all directions' })
  @ApiQuery({ name: 'type', required: false, enum: DirectionType })
  findAll(@Query('type') type?: DirectionType) {
    if (type) {
      return this.directionsService.findByType(type);
    }
    return this.directionsService.findAll();
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.TRADER, UserRole.MERCHANT)
  @ApiOperation({ summary: 'Get direction by ID' })
  findById(@Param('id', ParseUUIDPipe) id: string) {
    return this.directionsService.findById(id);
  }

  @Post()
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Create a new direction' })
  create(@Body() dto: CreateDirectionDto) {
    return this.directionsService.create(dto);
  }

  @Put(':id')
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Update direction' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDirectionDto,
  ) {
    return this.directionsService.update(id, dto);
  }

  @Patch(':id/toggle')
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Toggle direction online/offline' })
  toggle(@Param('id', ParseUUIDPipe) id: string) {
    return this.directionsService.toggleOnline(id);
  }

  @Patch(':id/online')
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Set direction online' })
  setOnline(@Param('id', ParseUUIDPipe) id: string) {
    return this.directionsService.setOnline(id);
  }

  @Patch(':id/offline')
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Set direction offline' })
  setOffline(@Param('id', ParseUUIDPipe) id: string) {
    return this.directionsService.setOffline(id);
  }
}
