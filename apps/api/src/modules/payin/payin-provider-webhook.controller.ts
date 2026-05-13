import {
  Controller,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Headers,
  BadRequestException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { PayinProviderService } from '../payin-provider/payin-provider.service';
import { PayinService } from './payin.service';

@ApiTags('internal-payin-provider')
@Controller('internal/payin-provider')
export class PayinProviderWebhookController {
  constructor(
    private readonly payinProvider: PayinProviderService,
    private readonly payin: PayinService,
  ) {}

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Pay-In external provider webhook (HMAC-SHA256 of raw body)',
    description:
      'Body JSON: `{ "payin_order_id": "<uuid>", "status": "paid" | "canceled" }`. Header `X-Payin-Provider-Signature` must equal hex(HMAC-SHA256(rawBody, PAYIN_PROVIDER_WEBHOOK_SECRET)).',
  })
  async webhook(
    @Req() req: Request & { rawBody?: Buffer },
    @Headers('x-payin-provider-signature') signature: string | undefined,
  ) {
    const raw = req.rawBody;
    if (!raw?.length) {
      throw new BadRequestException('Missing raw body');
    }
    if (!this.payinProvider.verifyWebhookSignature(raw, signature)) {
      throw new ForbiddenException('Invalid webhook signature');
    }
    let body: { payin_order_id?: string; status?: string };
    try {
      body = JSON.parse(raw.toString('utf-8')) as { payin_order_id?: string; status?: string };
    } catch {
      throw new BadRequestException('Invalid JSON body');
    }
    const status = String(body.status ?? '').trim().toLowerCase();
    if (status !== 'paid' && status !== 'canceled') {
      throw new BadRequestException('status must be paid or canceled');
    }
    const result = await this.payin.applyExternalProviderWebhook({
      payin_order_id: String(body.payin_order_id ?? ''),
      status,
    });
    if (!result.ok) {
      throw new BadRequestException(result.error);
    }
    return { ok: true as const, duplicate: result.duplicate ?? false };
  }
}
