import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import { Request } from 'express';
import { PrismaService } from '../../config/prisma.service';
import { NONCE_VALIDITY_SECONDS } from '@p2p/shared';

@Injectable()
export class HmacAuthGuard implements CanActivate {
  private readonly logger = new Logger(HmacAuthGuard.name);

  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();

    const apiKey = request.headers['x-api-key'] as string | undefined;
    const apiPayload = request.headers['x-api-payload'] as string | undefined;
    const apiSignature = request.headers['x-api-signature'] as string | undefined;

    if (!apiKey || !apiPayload || !apiSignature) {
      throw new ForbiddenException('Missing authentication headers');
    }

    const merchantApiKey = await this.prisma.merchantApiKey.findFirst({
      where: { publicKey: apiKey, isActive: true },
      include: { merchant: true },
    });

    if (!merchantApiKey) {
      throw new UnauthorizedException('Invalid API key');
    }

    const expectedDirection = request.path.includes('/payin/') ? 'PAYIN' : 'PAYOUT';
    if (merchantApiKey.direction !== expectedDirection) {
      throw new UnauthorizedException('API key direction mismatch');
    }

    if (!this.verifySignature(apiPayload, merchantApiKey.secretKeyHash, apiSignature)) {
      throw new UnauthorizedException('Invalid signature');
    }

    this.validateNonce(apiPayload);

    if (merchantApiKey.merchant.isLock) {
      throw new ForbiddenException('Merchant account is locked');
    }

    (request as any).merchantId = merchantApiKey.merchantId;
    (request as any).merchant = merchantApiKey.merchant;

    return true;
  }

  private verifySignature(payload: string, storedHash: string, signature: string): boolean {
    try {
      const computed = createHmac('sha512', storedHash)
        .update(payload)
        .digest('hex');

      if (computed.length !== signature.length) return false;

      return timingSafeEqual(
        Buffer.from(computed, 'hex'),
        Buffer.from(signature, 'hex'),
      );
    } catch {
      return false;
    }
  }

  private validateNonce(payload: string): void {
    try {
      const decoded = Buffer.from(payload, 'base64').toString('utf-8');
      let nonce: number | undefined;

      try {
        const json = JSON.parse(decoded);
        nonce = json.nonce;
      } catch {
        const nonceMatch = decoded.match(/nonce=(\d+)/);
        if (nonceMatch) nonce = parseInt(nonceMatch[1], 10);
      }

      if (nonce === undefined) {
        throw new UnauthorizedException('Nonce is required');
      }

      const nowSec = Math.floor(Date.now() / 1000);
      const nonceSec = nonce > 1e12 ? Math.floor(nonce / 1000) : nonce;
      if (Math.abs(nowSec - nonceSec) > NONCE_VALIDITY_SECONDS) {
        throw new UnauthorizedException('Nonce expired');
      }
    } catch (e) {
      if (e instanceof UnauthorizedException) throw e;
      throw new UnauthorizedException('Invalid payload: nonce parsing failed');
    }
  }
}
