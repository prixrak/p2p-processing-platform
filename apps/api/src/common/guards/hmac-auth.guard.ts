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
import { NonceStoreService } from '../services/nonce-store.service';
import { decryptSecret } from '../utils/crypto';
import { NONCE_VALIDITY_SECONDS } from '@p2p/shared';

@Injectable()
export class HmacAuthGuard implements CanActivate {
  private readonly logger = new Logger(HmacAuthGuard.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly nonceStore: NonceStoreService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();

    const apiKey = request.headers['x-api-key'] as string | undefined;
    const apiPayload = request.headers['x-api-payload'] as string | undefined;
    const apiSignature = request.headers['x-api-signature'] as string | undefined;

    if (!apiKey || !apiPayload || !apiSignature) {
      throw new ForbiddenException('Missing authentication headers');
    }

    this.verifyPayloadIntegrity(apiPayload, request);

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

    let rawSecret: string;
    try {
      rawSecret = decryptSecret(merchantApiKey.secretKeyHash);
    } catch {
      this.logger.error(`Failed to decrypt secret for key ${merchantApiKey.id}, may be legacy SHA256 format`);
      throw new UnauthorizedException('Invalid API key configuration');
    }

    // Detect auth version: v2 payloads include "api_path" field in the JSON body
    const isV2 = this.isV2Payload(apiPayload);
    if (!this.verifySignature(apiPayload, rawSecret, apiSignature, isV2)) {
      throw new UnauthorizedException('Invalid signature');
    }

    await this.validateNonce(apiPayload);

    if (merchantApiKey.merchant.isLock) {
      throw new ForbiddenException('Merchant account is locked');
    }

    (request as any).merchantId = merchantApiKey.merchantId;
    (request as any).merchant = merchantApiKey.merchant;

    return true;
  }

  private verifyPayloadIntegrity(apiPayload: string, request: Request): void {
    const decodedPayload = Buffer.from(apiPayload, 'base64').toString('utf-8');

    const contentType = request.headers['content-type'] ?? '';
    if (contentType.includes('multipart/form-data')) {
      // For multipart endpoints, payload must be "id={id};status={status};nonce={nonce}"
      // or "order_id={id};paid_amount={amount};nonce={nonce}" — validate it parses correctly
      const hasRequiredFields =
        /nonce=\d+/.test(decodedPayload) &&
        (/id=[^;]+/.test(decodedPayload) || /order_id=[^;]+/.test(decodedPayload));
      if (!hasRequiredFields) {
        throw new UnauthorizedException('Multipart payload missing required fields (id/order_id, nonce)');
      }
      return;
    }

    const rawBody = (request as any).rawBody as Buffer | undefined;
    if (!rawBody) {
      this.logger.warn('Raw body not available for payload integrity check');
      return;
    }

    const bodyString = rawBody.toString('utf-8');

    let payloadParsed: Record<string, unknown> | null = null;
    let payloadNormalized: string;
    let bodyNormalized: string;
    try {
      payloadParsed = JSON.parse(decodedPayload) as Record<string, unknown>;
      payloadNormalized = JSON.stringify(payloadParsed);
      bodyNormalized = JSON.stringify(JSON.parse(bodyString));
    } catch {
      payloadNormalized = decodedPayload;
      bodyNormalized = bodyString;
    }

    if (payloadNormalized !== bodyNormalized) {
      throw new UnauthorizedException(
        'X-API-PAYLOAD does not match request body',
      );
    }

    // ── Auth v2: validate api_path matches actual request path ──────────────
    if (payloadParsed && 'api_path' in payloadParsed) {
      const declaredPath = payloadParsed['api_path'] as string;
      const actualPath = request.path;
      if (declaredPath !== actualPath) {
        throw new UnauthorizedException(
          `api_path mismatch: declared "${declaredPath}", actual "${actualPath}"`,
        );
      }
    }
  }

  /**
   * v2 payloads carry an "api_path" field inside the JSON body.
   * v1 payloads are plain JSON without that field (or multipart key=value strings).
   */
  private isV2Payload(apiPayload: string): boolean {
    try {
      const decoded = Buffer.from(apiPayload, 'base64').toString('utf-8');
      const parsed = JSON.parse(decoded) as Record<string, unknown>;
      return 'api_path' in parsed;
    } catch {
      return false;
    }
  }

  private verifySignature(payload: string, secret: string, signature: string, isV2: boolean): boolean {
    try {
      // v1: secret is Base64-encoded — decode it before use as HMAC key
      // v2: secret used as-is (plain string)
      const hmacKey: string | Buffer = isV2 ? secret : Buffer.from(secret, 'base64');

      const computed = createHmac('sha512', hmacKey)
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

  private async validateNonce(payload: string): Promise<void> {
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

      const nonceKey = `${nonce}`;
      if (await this.nonceStore.isNonceUsed(nonceKey)) {
        throw new UnauthorizedException('Nonce already used (replay detected)');
      }
      await this.nonceStore.markNonceUsed(nonceKey);
    } catch (e) {
      if (e instanceof UnauthorizedException) throw e;
      throw new UnauthorizedException('Invalid payload: nonce parsing failed');
    }
  }
}
