import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { authenticator } from 'otplib';
import { config } from '@p2p/config';
import { PrismaService } from '../../config/prisma.service';
import { comparePassword } from '../../common/utils/password';
import { JwtPayload } from './jwt.strategy';

/** Returned when credentials are valid but the user cannot sign in because the account is inactive. */
export const LOGIN_ACCOUNT_DEACTIVATED_MESSAGE =
  'This account has been deactivated. Please contact support.';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async validateUser(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user) {
      return null;
    }

    const match = await comparePassword(password, user.passwordHash);
    return match ? user : null;
  }

  async login(email: string, password: string) {
    const user = await this.validateUser(email, password);

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.isActive) {
      throw new UnauthorizedException(LOGIN_ACCOUNT_DEACTIVATED_MESSAGE);
    }

    if (user.twoFaSecret) {
      const tempPayload = { sub: user.id, type: '2fa-pending' };
      const tempToken = await this.jwtService.signAsync(tempPayload as any, {
        expiresIn: '5m' as any,
      });
      return { requires2FA: true, tempToken };
    }

    return this.generateTokens(user);
  }

  async verify2FALogin(tempToken: string, code: string) {
    let decoded: any;
    try {
      decoded = await this.jwtService.verifyAsync(tempToken);
    } catch {
      throw new UnauthorizedException('Invalid or expired temp token');
    }

    if (decoded.type !== '2fa-pending') {
      throw new UnauthorizedException('Invalid token type');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: decoded.sub },
      select: { id: true, email: true, role: true, isActive: true, twoFaSecret: true },
    });

    if (!user || !user.twoFaSecret) {
      throw new UnauthorizedException('Invalid state');
    }

    if (!user.isActive) {
      throw new UnauthorizedException(LOGIN_ACCOUNT_DEACTIVATED_MESSAGE);
    }

    const isValid = authenticator.verify({ token: code, secret: user.twoFaSecret });
    if (!isValid) {
      throw new UnauthorizedException('Invalid 2FA code');
    }

    this.logger.log(`User ${user.email} completed 2FA login`);
    return this.generateTokens(user);
  }

  private async generateTokens(user: { id: string; email: string; role: any }) {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload as any, {
        expiresIn: config.jwt.accessExpiresIn as any,
      }),
      this.jwtService.signAsync(
        { ...payload, type: 'refresh' } as any,
        { expiresIn: config.jwt.refreshExpiresIn as any },
      ),
    ]);

    this.logger.log(`User ${user.email} logged in`);

    return { accessToken, refreshToken, user: { id: user.id, email: user.email, role: user.role } };
  }

  async refreshToken(token: string) {
    try {
      const decoded = await this.jwtService.verifyAsync<
        JwtPayload & { type?: string }
      >(token);

      if (decoded.type !== 'refresh') {
        throw new UnauthorizedException('Invalid token type');
      }

      const user = await this.prisma.user.findUnique({
        where: { id: decoded.sub },
        select: { id: true, email: true, role: true, isActive: true },
      });

      if (!user) {
        throw new UnauthorizedException('Invalid or expired refresh token');
      }

      if (!user.isActive) {
        throw new UnauthorizedException(LOGIN_ACCOUNT_DEACTIVATED_MESSAGE);
      }

      return this.generateTokens(user);
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  async setup2FA(userId: string) {
    const secret = authenticator.generateSecret();

    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFaSecret: secret },
    });

    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { email: true },
    });

    const otpAuthUrl = authenticator.keyuri(
      user.email,
      'P2P Platform',
      secret,
    );

    return { secret, otpAuthUrl };
  }

  async verify2FA(userId: string, token: string): Promise<boolean> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { twoFaSecret: true },
    });

    if (!user.twoFaSecret) {
      throw new UnauthorizedException('2FA not configured');
    }

    return authenticator.verify({ token, secret: user.twoFaSecret });
  }
}
