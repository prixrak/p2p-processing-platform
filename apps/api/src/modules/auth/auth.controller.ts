import {
  Controller,
  Post,
  Body,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { RefreshDto } from './dto/refresh.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Audited } from '../../common/decorators/audited.decorator';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with email and password' })
  @Audited('LOGIN', 'User')
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto.email, dto.password);
  }

  @Post('register')
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @ApiOperation({ summary: 'Register a new user' })
  @Audited('REGISTER', 'User')
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto.email, dto.password, dto.role);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token' })
  async refresh(@Body() dto: RefreshDto) {
    return this.authService.refreshToken(dto.refreshToken);
  }

  @Post('2fa/setup')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Setup 2FA — returns secret and OTP auth URL' })
  async setup2FA(@Req() req: Request) {
    const user = req.user as { id: string };
    return this.authService.setup2FA(user.id);
  }

  @Post('2fa/verify')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify 2FA token (for already-authenticated users)' })
  async verify2FA(
    @Req() req: Request,
    @Body('token') token: string,
  ) {
    const user = req.user as { id: string };
    const valid = await this.authService.verify2FA(user.id, token);
    return { valid };
  }

  @Post('2fa/enable')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Setup and enable 2FA in one step (provide TOTP code to confirm)' })
  @Audited('ENABLE_2FA', 'User')
  async enable2FA(
    @Req() req: Request,
    @Body('code') code: string,
  ) {
    const user = req.user as { id: string };
    const { secret, otpAuthUrl } = await this.authService.setup2FA(user.id);
    const valid = await this.authService.verify2FA(user.id, code);
    if (!valid) {
      throw new UnauthorizedException('Invalid 2FA code — secret was reset, try setup again');
    }
    return { enabled: true, secret, otpAuthUrl };
  }

  @Post('2fa/login')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Complete login with 2FA code' })
  @Audited('LOGIN_2FA', 'User')
  async verify2FALogin(
    @Body('tempToken') tempToken: string,
    @Body('code') code: string,
  ) {
    return this.authService.verify2FALogin(tempToken, code);
  }
}
