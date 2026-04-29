import {
  Controller,
  Get,
  Patch,
  Post,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { TelegramService } from './telegram.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '@p2p/shared';

@ApiTags('Telegram')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('telegram')
export class TelegramController {
  constructor(private readonly telegramService: TelegramService) {}

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
    const token = this.telegramService.generateConnectToken(traderId);
    return { token };
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
    const token = this.telegramService.generatePayoutTraderConnectToken(payoutTraderId);
    return { token };
  }

  @Post('bot/connect')
  @ApiOperation({ summary: 'Telegram bot callback to link a chat via token' })
  async botConnect(@Body() body: { token: string; chatId: string }) {
    return this.telegramService.handleBotConnect(body.token, body.chatId);
  }
}
