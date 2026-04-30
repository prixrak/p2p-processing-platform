import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { InternalApiKeyGuard } from '../../common/guards/internal-api-key.guard';
import { GenerateTraderWalletDto } from './dto/generate-trader-wallet.dto';
import { TraderWalletsService } from './trader-wallets.service';

/** Inter-service wallet API (TZ Wallet Service). Not for public exposure. */
@ApiTags('internal-wallets')
@Controller('internal/wallets')
@UseGuards(InternalApiKeyGuard)
export class InternalWalletsController {
  constructor(private readonly traderWallets: TraderWalletsService) {}

  @Post('generate')
  @HttpCode(HttpStatus.CREATED)
  async generate(@Body() dto: GenerateTraderWalletDto) {
    return this.traderWallets.generateForTrader(dto.trader_id);
  }

  @Get(':traderId')
  async getWallet(@Param('traderId', ParseUUIDPipe) traderId: string) {
    return this.traderWallets.getForTrader(traderId);
  }
}
