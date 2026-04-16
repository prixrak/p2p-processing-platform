import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { createHmac } from 'crypto';
import {
  DirectionType,
  EXTERNAL_API_V1_PREFIX,
  ExternalApiHeadersLower,
} from '@p2p/shared';
import { HmacAuthGuard } from './hmac-auth.guard';
import { PrismaService } from '../../config/prisma.service';
import { NonceStoreService } from '../services/nonce-store.service';
import { encryptSecret } from '../utils/crypto';

function createExecutionContext(req: {
  path: string;
  headers: Record<string, string>;
  rawBody?: Buffer;
}): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => req,
    }),
  } as ExecutionContext;
}

describe('HmacAuthGuard', () => {
  const secret = 'unit-test-merchant-secret-key!!';
  const publicKey = 'pk-unit-test';
  const secretKeyHash = encryptSecret(secret);
  const merchantId = 'merchant-unit-1';
  const payinUploadPath = `${EXTERNAL_API_V1_PREFIX}/payin/upload_order`;

  const payinMerchantKey = {
    id: 'key-1',
    publicKey,
    secretKeyHash,
    direction: DirectionType.PAYIN,
    merchantId,
    merchant: { isLock: false },
  };

  let prisma: { merchantApiKey: { findFirst: jest.Mock } };
  let nonceStore: jest.Mocked<Pick<NonceStoreService, 'isNonceUsed' | 'markNonceUsed'>>;
  let guard: HmacAuthGuard;

  beforeEach(() => {
    prisma = {
      merchantApiKey: {
        findFirst: jest.fn().mockResolvedValue(payinMerchantKey),
      },
    };
    nonceStore = {
      isNonceUsed: jest.fn().mockResolvedValue(false),
      markNonceUsed: jest.fn().mockResolvedValue(undefined),
    };
    guard = new HmacAuthGuard(prisma as unknown as PrismaService, nonceStore as unknown as NonceStoreService);
  });

  /** v2 HMAC: non-empty `api_url` in body → plaintext secret as key; must match request.path. */
  function signBody(body: Record<string, unknown>, apiUrl: string = payinUploadPath) {
    const raw = JSON.stringify({ ...body, api_url: apiUrl });
    const apiPayload = Buffer.from(raw, 'utf-8').toString('base64');
    const signature = createHmac('sha512', secret).update(apiPayload).digest('hex');
    return { raw, apiPayload, signature };
  }

  it('throws ForbiddenException when headers are missing', async () => {
    const ctx = createExecutionContext({
      path: payinUploadPath,
      headers: {},
    });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('throws UnauthorizedException when API key is unknown', async () => {
    prisma.merchantApiKey.findFirst.mockResolvedValueOnce(null);
    const nonce = Math.floor(Date.now() / 1000);
    const { raw, apiPayload, signature } = signBody({
      request_id: 'r1',
      amount: 1,
      currency: 'UAH',
      user_full_name: 'U',
      nonce,
    });
    const ctx = createExecutionContext({
      path: payinUploadPath,
      headers: {
        [ExternalApiHeadersLower.API_KEY]: publicKey,
        [ExternalApiHeadersLower.API_PAYLOAD]: apiPayload,
        [ExternalApiHeadersLower.API_SIGNATURE]: signature,
        'content-type': 'application/json',
      },
      rawBody: Buffer.from(raw, 'utf-8'),
    });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('throws UnauthorizedException when key direction does not match path', async () => {
    prisma.merchantApiKey.findFirst.mockResolvedValueOnce({
      ...payinMerchantKey,
      direction: DirectionType.PAYOUT,
    });
    const nonce = Math.floor(Date.now() / 1000);
    const { raw, apiPayload, signature } = signBody({
      request_id: 'r1',
      amount: 1,
      currency: 'UAH',
      user_full_name: 'U',
      nonce,
    });
    const ctx = createExecutionContext({
      path: payinUploadPath,
      headers: {
        [ExternalApiHeadersLower.API_KEY]: publicKey,
        [ExternalApiHeadersLower.API_PAYLOAD]: apiPayload,
        [ExternalApiHeadersLower.API_SIGNATURE]: signature,
        'content-type': 'application/json',
      },
      rawBody: Buffer.from(raw, 'utf-8'),
    });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('throws UnauthorizedException when signature is invalid', async () => {
    const nonce = Math.floor(Date.now() / 1000);
    const { raw, apiPayload } = signBody({
      request_id: 'r1',
      amount: 1,
      currency: 'UAH',
      user_full_name: 'U',
      nonce,
    });
    const ctx = createExecutionContext({
      path: payinUploadPath,
      headers: {
        [ExternalApiHeadersLower.API_KEY]: publicKey,
        [ExternalApiHeadersLower.API_PAYLOAD]: apiPayload,
        [ExternalApiHeadersLower.API_SIGNATURE]: '0'.repeat(128),
        'content-type': 'application/json',
      },
      rawBody: Buffer.from(raw, 'utf-8'),
    });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('throws UnauthorizedException when nonce is expired', async () => {
    const oldNonce = Math.floor(Date.now() / 1000) - 400;
    const { raw, apiPayload, signature } = signBody({
      request_id: 'r1',
      amount: 1,
      currency: 'UAH',
      user_full_name: 'U',
      nonce: oldNonce,
    });
    const ctx = createExecutionContext({
      path: payinUploadPath,
      headers: {
        [ExternalApiHeadersLower.API_KEY]: publicKey,
        [ExternalApiHeadersLower.API_PAYLOAD]: apiPayload,
        [ExternalApiHeadersLower.API_SIGNATURE]: signature,
        'content-type': 'application/json',
      },
      rawBody: Buffer.from(raw, 'utf-8'),
    });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('throws UnauthorizedException on nonce replay', async () => {
    nonceStore.isNonceUsed.mockResolvedValueOnce(true);
    const nonce = Math.floor(Date.now() / 1000);
    const { raw, apiPayload, signature } = signBody({
      request_id: 'r1',
      amount: 1,
      currency: 'UAH',
      user_full_name: 'U',
      nonce,
    });
    const ctx = createExecutionContext({
      path: payinUploadPath,
      headers: {
        [ExternalApiHeadersLower.API_KEY]: publicKey,
        [ExternalApiHeadersLower.API_PAYLOAD]: apiPayload,
        [ExternalApiHeadersLower.API_SIGNATURE]: signature,
        'content-type': 'application/json',
      },
      rawBody: Buffer.from(raw, 'utf-8'),
    });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('throws ForbiddenException when merchant account is locked', async () => {
    prisma.merchantApiKey.findFirst.mockResolvedValueOnce({
      ...payinMerchantKey,
      merchant: { isLock: true },
    });
    const nonce = Math.floor(Date.now() / 1000);
    const { raw, apiPayload, signature } = signBody({
      request_id: 'r1',
      amount: 1,
      currency: 'UAH',
      user_full_name: 'U',
      nonce,
    });
    const ctx = createExecutionContext({
      path: payinUploadPath,
      headers: {
        [ExternalApiHeadersLower.API_KEY]: publicKey,
        [ExternalApiHeadersLower.API_PAYLOAD]: apiPayload,
        [ExternalApiHeadersLower.API_SIGNATURE]: signature,
        'content-type': 'application/json',
      },
      rawBody: Buffer.from(raw, 'utf-8'),
    });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('throws UnauthorizedException when X-API-PAYLOAD does not match raw body', async () => {
    const nonce = Math.floor(Date.now() / 1000);
    const { apiPayload, signature } = signBody({
      request_id: 'r1',
      amount: 1,
      currency: 'UAH',
      user_full_name: 'U',
      nonce,
    });
    const ctx = createExecutionContext({
      path: payinUploadPath,
      headers: {
        [ExternalApiHeadersLower.API_KEY]: publicKey,
        [ExternalApiHeadersLower.API_PAYLOAD]: apiPayload,
        [ExternalApiHeadersLower.API_SIGNATURE]: signature,
        'content-type': 'application/json',
      },
      rawBody: Buffer.from(JSON.stringify({ tampered: true }), 'utf-8'),
    });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('sets merchantId on request when authentication succeeds', async () => {
    const nonce = Math.floor(Date.now() / 1000);
    const { raw, apiPayload, signature } = signBody({
      request_id: 'r1',
      amount: 1,
      currency: 'UAH',
      user_full_name: 'U',
      nonce,
    });
    const req: Record<string, unknown> = {
      path: payinUploadPath,
      headers: {
        [ExternalApiHeadersLower.API_KEY]: publicKey,
        [ExternalApiHeadersLower.API_PAYLOAD]: apiPayload,
        [ExternalApiHeadersLower.API_SIGNATURE]: signature,
        'content-type': 'application/json',
      },
      rawBody: Buffer.from(raw, 'utf-8'),
    };
    const ctx = createExecutionContext(req as any);
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(req.merchantId).toBe(merchantId);
    expect(nonceStore.markNonceUsed).toHaveBeenCalledWith(String(nonce));
  });
});
