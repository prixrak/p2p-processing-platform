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
import {
  NONCE_VALIDITY_SECONDS,
  DirectionType,
  ExternalApiHeadersLower,
} from '@p2p/shared';

/**
 * Guard for merchant external API requests.
 *
 * Every request to /api/external/v1/* must include three headers:
 *   X-API-KEY       — merchant public key (pk_payin_... / pk_payout_...)
 *   X-API-PAYLOAD   — request body encoded as Base64
 *   X-API-SIGNATURE — HMAC-SHA512 over the X-API-PAYLOAD string
 *
 * ─── Authentication versions ───────────────────────────────────────────────
 *
 * v1 (basic):
 *   • Body is plain JSON without extra control fields
 *   • Nonce is absent or optional
 *   • Multipart endpoints — X-API-PAYLOAD is built from a formula:
 *       Base64("id={id};status={status};nonce={nonce}")       ← update_order_with_proofs
 *       Base64("order_id={id};paid_amount={amt};nonce={n}")   ← appeal/send
 *     (nonce is REQUIRED in multipart even for v1)
 *
 * v2 (extended):
 *   • Body includes control fields: api_url and nonce
 *   • api_url — path of the current endpoint (binds signature to URL)
 *   • nonce   — Unix timestamp in seconds (replay protection)
 *   • Nonce is REQUIRED; reuse is blocked by NonceStore
 *
 * Version is inferred automatically: non-empty api_url in JSON body means v2.
 *
 * ─── Validation order ─────────────────────────────────────────────────────
 *  1. All three headers present                    → 403 if missing
 *  2. Resolve version (v1 / v2)
 *  3. Payload integrity (payload matches body)      → 401
 *  4. Look up API key in DB                         → 401 if not found
 *  5. Key direction matches route (payin/payout)     → 401
 *  6. Decrypt secret from DB (AES-256-GCM)
 *  7. Verify HMAC signature                        → 401
 *  8. Validate nonce (expiry + replay)             → 401
 *  9. Merchant not locked                          → 403
 * 10. Attach merchantId and merchant to request
 */
@Injectable()
export class HmacAuthGuard implements CanActivate {
  private readonly logger = new Logger(HmacAuthGuard.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly nonceStore: NonceStoreService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();

    // ── 1. Require all three headers ───────────────────────────────────────
    const apiKey = request.headers[ExternalApiHeadersLower.API_KEY] as string | undefined;
    const apiPayload = request.headers[ExternalApiHeadersLower.API_PAYLOAD] as string | undefined;
    const apiSignature = request.headers[ExternalApiHeadersLower.API_SIGNATURE] as
      | string
      | undefined;

    if (!apiKey || !apiPayload || !apiSignature) {
      throw new ForbiddenException('Missing authentication headers');
    }

    // ── 2. Resolve version ─────────────────────────────────────────────────
    // Done early because verifyPayloadIntegrity and validateNonce depend on it.
    const isV2 = this.isV2Payload(apiPayload);

    // ── 3. Payload integrity ───────────────────────────────────────────────
    // Ensure X-API-PAYLOAD is really base64(request body), not a swapped payload.
    this.verifyPayloadIntegrity(apiPayload, request, isV2);

    // ── 4. Look up API key in DB ──────────────────────────────────────────
    const merchantApiKey = await this.prisma.merchantApiKey.findFirst({
      where: { publicKey: apiKey, isActive: true },
      include: { merchant: true },
    });

    if (!merchantApiKey) {
      throw new UnauthorizedException('Invalid API key');
    }

    // ── 5. Key direction ───────────────────────────────────────────────────
    // Pay-In key cannot be used for Pay-Out and vice versa.
    const expectedDirection = request.path.includes('/payin/')
      ? DirectionType.PAYIN
      : DirectionType.PAYOUT;
    if (merchantApiKey.direction !== expectedDirection) {
      throw new UnauthorizedException('API key direction mismatch');
    }

    // ── 6. Decrypt secret ──────────────────────────────────────────────────
    // Secret is stored encrypted in DB (AES-256-GCM).
    // decryptSecret yields the original string like sk_payin_<64 hex>.
    let rawSecret: string;
    try {
      rawSecret = decryptSecret(merchantApiKey.secretKeyHash);
    } catch {
      this.logger.error(`Failed to decrypt secret for key ${merchantApiKey.id}, may be SHA256-fingerprint-only blob`);
      throw new UnauthorizedException('Invalid API key configuration');
    }

    // ── 7. Verify HMAC signature ───────────────────────────────────────────
    if (!this.verifySignature(apiPayload, rawSecret, apiSignature, isV2)) {
      throw new UnauthorizedException('Invalid signature');
    }

    // ── 8. Validate nonce ────────────────────────────────────────────────
    // v1 JSON: nonce optional; if absent, validation is skipped.
    // v1 multipart: nonce required (checked in verifyPayloadIntegrity).
    // v2: nonce always required.
    await this.validateNonce(apiPayload, isV2);

    // ── 9. Merchant lock ───────────────────────────────────────────────────
    if (merchantApiKey.merchant.isLock) {
      throw new ForbiddenException('Merchant account is locked');
    }

    // ── 10. Attach context to request ────────────────────────────────────
    // Controllers read merchantId and merchant from request after the guard.
    (request as any).merchantId = merchantApiKey.merchantId;
    (request as any).merchant = merchantApiKey.merchant;

    return true;
  }

  /**
   * Ensures X-API-PAYLOAD matches the actual request body.
   *
   * Goal: prevent an attacker from signing one body and sending another.
   * Without this check the signature can still verify while stored data is swapped.
   *
   * JSON (application/json):
   *   - Decode base64 payload and compare with request rawBody
   *   - For v1, strip `nonce` from both sides before compare (optional field asymmetry)
   *   - For v2, also assert api_url matches the real path
   *
   * Multipart (multipart/form-data):
   *   - Payload is built from a formula (semicolon-separated key=value), not raw body
   *   - Only required fields presence is validated
   */
  private verifyPayloadIntegrity(apiPayload: string, request: Request, isV2: boolean): void {
    const decodedPayload = Buffer.from(apiPayload, 'base64').toString('utf-8');

    const contentType = request.headers['content-type'] ?? '';
    if (contentType.includes('multipart/form-data')) {
      // Multipart payload formula is always key=value pairs with nonce required (v1 + v2):
      //   update_order_with_proofs: "id={id};status={status};nonce={nonce}"
      //   appeal/send:              "order_id={order_id};paid_amount={paid_amount};nonce={nonce}"
      const hasIdField = /id=[^;]+/.test(decodedPayload) || /order_id=[^;]+/.test(decodedPayload);
      const hasNonce = /nonce=\d+/.test(decodedPayload);
      if (!hasIdField || !hasNonce) {
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
      let bodyParsed = JSON.parse(bodyString) as Record<string, unknown>;

      // v1: nonce is optional — strip it from both sides before comparing so a
      // mismatch caused solely by one side including nonce and the other not does
      // not produce a false-positive integrity failure.
      if (!isV2) {
        const { nonce: _pn, ...payloadWithoutNonce } = payloadParsed;
        const { nonce: _bn, ...bodyWithoutNonce } = bodyParsed;
        payloadParsed = payloadWithoutNonce;
        bodyParsed = bodyWithoutNonce;
      }

      payloadNormalized = JSON.stringify(payloadParsed);
      bodyNormalized = JSON.stringify(bodyParsed);
    } catch {
      payloadNormalized = decodedPayload;
      bodyNormalized = bodyString;
    }

    if (payloadNormalized !== bodyNormalized) {
      throw new UnauthorizedException(
        'X-API-PAYLOAD does not match request body',
      );
    }

    // ── Auth v2: api_url must match actual request path ────────────────────
    // Mitigates URL swap: signed for /endpoint-A but replayed to /endpoint-B.
    if (payloadParsed && 'api_url' in payloadParsed) {
      const raw = payloadParsed['api_url'];
      if (typeof raw === 'string' && raw.trim() !== '') {
        const declaredPath = this.normalizeApiUrlToPath(raw);
        const actualPath = request.path;
        if (declaredPath !== actualPath) {
          throw new UnauthorizedException(
            `api_url mismatch: declared "${raw}" resolves to "${declaredPath}", actual "${actualPath}"`,
          );
        }
      }
    }
  }

  /**
   * Resolves auth version from payload content.
   *
   * v2 — JSON body has non-empty `api_url` string.
   * v1 — api_url missing or empty (including multipart strings).
   */
  private isV2Payload(apiPayload: string): boolean {
    try {
      const decoded = Buffer.from(apiPayload, 'base64').toString('utf-8');
      const parsed = JSON.parse(decoded) as Record<string, unknown>;
      const u = parsed['api_url'];
      return typeof u === 'string' && u.trim() !== '';
    } catch {
      return false;
    }
  }

  /**
   * Normalizes api_url to a path (pathname).
   * Accepts either a relative path (/api/...) or a full URL (https://...).
   */
  private normalizeApiUrlToPath(value: string): string {
    const v = value.trim();
    if (/^https?:\/\//i.test(v)) {
      try {
        return new URL(v).pathname;
      } catch {
        return v;
      }
    }
    return v;
  }

  /**
   * Verifies HMAC-SHA512 signature.
   *
   * Algorithm:
   *   signature = HMAC-SHA512( key=secret, data=X-API-PAYLOAD-string ).hex
   *
   * Secret is used as plaintext (e.g. sk_payin_<64 hex>).
   * timingSafeEqual mitigates timing attacks on signature compare.
   */
  private verifySignature(payload: string, secret: string, signature: string, _isV2: boolean): boolean {
    try {
      // Both v1 and v2 use the plaintext secret as-is for the HMAC key.
      // Secrets are generated as 'sk_(payin|payout)_<64 hex chars>' — not base64 —
      // so decoding them as base64 would produce garbage and never verify.
      const computed = createHmac('sha512', secret)
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

  /**
   * Validates nonce (replay protection).
   *
   * Nonce is a Unix timestamp in seconds (or milliseconds — normalized).
   * Rules:
   *   - Must be within NONCE_VALIDITY_SECONDS of now (5 minutes)
   *   - Each nonce may be used only once (NonceStore tracks used values)
   *
   * v1 JSON: if nonce is absent, validation is skipped (optional).
   * v2 and multipart: nonce required.
   *
   * Extraction:
   *   - JSON payload: `nonce` field
   *   - Multipart payload ("id=...;nonce=123"): parsed with a regex
   */
  private async validateNonce(payload: string, isV2: boolean): Promise<void> {
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
        // v1: nonce is optional — skip replay protection if absent
        if (!isV2) return;
        throw new UnauthorizedException('Nonce is required');
      }

      // If nonce > 1e12, treat as milliseconds and convert to seconds
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
