import {
  Controller,
  Get,
  Patch,
  Post,
  Body,
  UseGuards,
  MessageEvent,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { TelegramService } from './telegram.service';
import { TelegramRealtimeService } from './telegram-realtime.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '@p2p/shared';
import { SseStream } from '../../common/decorators/sse-stream.decorator';

@ApiTags('Telegram')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('telegram')
export class TelegramController {
  constructor(
    private readonly telegramService: TelegramService,
    private readonly telegramRealtime: TelegramRealtimeService,
  ) {}

  @Get('settings')
  @Roles(UserRole.TRADER)
  @ApiOperation({ summary: 'Get telegram notification settings for current trader' })
  async getSettings(@CurrentUser('traderId') traderId: string) {
    return this.telegramService.getSettings(traderId);
  }

  @Patch('settings')
  @Roles(UserRole.TRADER)
  @ApiOperation({ summary: 'Update telegram notification settings' })
  async updateSettings(
    @CurrentUser('traderId') traderId: string,
    @Body()
    dto: {
      notifyPayin?: boolean;
      notifyPayout?: boolean;
      notifyAppeals?: boolean;
      notifyLowPayinCapacity?: boolean;
      notifyTopUpConfirm?: boolean;
      notifyPayinCapacityExhausted?: boolean;
      isActive?: boolean;
    },
  ) {
    return this.telegramService.updateSettings(traderId, dto);
  }

  @Post('connect')
  @Roles(UserRole.TRADER)
  @ApiOperation({ summary: 'Generate a connect token for linking Telegram' })
  async connect(@CurrentUser('traderId') traderId: string) {
    const token = await this.telegramService.generateConnectToken(traderId);
    return this.telegramService.createConnectResponse(token);
  }

  @SseStream('stream')
  @Roles(UserRole.TRADER)
  @ApiOperation({ summary: 'SSE stream for Telegram link events (trader cabinet)' })
  streamForTrader(@CurrentUser('traderId') traderId: string): Observable<MessageEvent> {
    return this.telegramRealtime.streamForTrader(traderId);
  }

  @Get('payout-trader/settings')
  @Roles(UserRole.PAYOUT_TRADER)
  @ApiOperation({ summary: 'Telegram settings for Pay-Out specialist' })
  async getPayoutTraderSettings(@CurrentUser('payoutTraderId') payoutTraderId: string) {
    return this.telegramService.getPayoutTraderSettings(payoutTraderId);
  }

  @Patch('payout-trader/settings')
  @Roles(UserRole.PAYOUT_TRADER)
  @ApiOperation({ summary: 'Update Pay-Out specialist Telegram notification preferences' })
  async patchPayoutTraderSettings(
    @CurrentUser('payoutTraderId') payoutTraderId: string,
    @Body()
    dto: {
      notifyNewPoolOrder?: boolean;
      notifySettlement?: boolean;
      isActive?: boolean;
    },
  ) {
    return this.telegramService.updatePayoutTraderSettings(payoutTraderId, dto);
  }

  @Post('payout-trader/connect')
  @Roles(UserRole.PAYOUT_TRADER)
  @ApiOperation({ summary: 'Generate a connect token (Pay-Out specialist Telegram)' })
  async connectPayoutTrader(@CurrentUser('payoutTraderId') payoutTraderId: string) {
    const token = await this.telegramService.generatePayoutTraderConnectToken(payoutTraderId);
    return this.telegramService.createConnectResponse(token);
  }

  @SseStream('payout-trader/stream')
  @Roles(UserRole.PAYOUT_TRADER)
  @ApiOperation({ summary: 'SSE stream for Telegram link events (Pay-Out specialist)' })
  streamForPayoutTrader(
    @CurrentUser('payoutTraderId') payoutTraderId: string,
  ): Observable<MessageEvent> {
    return this.telegramRealtime.streamForPayoutTrader(payoutTraderId);
  }
}
