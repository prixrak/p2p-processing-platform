import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { config } from '@p2p/config';
import { UserRole } from '@p2p/shared';
import { PrismaService } from '../../config/prisma.service';

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  type?: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.jwt.secret,
    });
  }

  async validate(payload: JwtPayload) {
    if (payload.type === 'refresh' || payload.type === '2fa-pending') {
      throw new UnauthorizedException('Cannot use this token type for API access');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, role: true, isActive: true },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('User not found or deactivated');
    }

    // Coerce enum / driver-specific role values so RolesGuard `.includes(role)` succeeds.
    const role = String(user.role ?? '').trim();

    const result: Record<string, unknown> = {
      id: user.id,
      email: user.email,
      role,
    };

    if (role === UserRole.TRADER) {
      const trader = await this.prisma.traderProfile.findUnique({
        where: { userId: user.id },
        select: { id: true },
      });
      result.traderId = trader?.id ?? null;
    }

    if (role === UserRole.PAYOUT_TRADER) {
      const pt = await this.prisma.payoutTraderProfile.findUnique({
        where: { userId: user.id },
        select: { id: true },
      });
      result.payoutTraderId = pt?.id ?? null;
    }

    if (role === UserRole.MERCHANT) {
      const merchant = await this.prisma.merchant.findUnique({
        where: { userId: user.id },
        select: { id: true },
      });
      result.merchantId = merchant?.id ?? null;
    }

    return result;
  }
}
