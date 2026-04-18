import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { PrismaService } from '../../config/prisma.service';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('live')
  @ApiOperation({ summary: 'Liveness probe (no dependency checks); use behind a load balancer' })
  live() {
    return {
      status: 'live',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  }

  @Get()
  @ApiOperation({ summary: 'Health check' })
  async check() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        database: 'connected',
      };
    } catch {
      return {
        status: 'degraded',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        database: 'disconnected',
      };
    }
  }

  @Get('ready')
  @ApiOperation({ summary: 'Readiness check' })
  async readiness() {
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: 'ready' };
  }
}
