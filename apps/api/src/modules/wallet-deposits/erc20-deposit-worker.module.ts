import { Module } from '@nestjs/common';
import { PrismaModule } from '../../config/prisma.module';
import { TelegramModule } from '../telegram/telegram.module';
import { OpsAlertsModule } from '../ops-alerts/ops-alerts.module';
import { WalletDepositsModule } from './wallet-deposits.module';
import { EthereumJsonRpcClient } from './ethereum-json-rpc.client';
import { Erc20DepositPollerService } from './erc20-deposit-poller.service';

/**
 * ERC-20 USDT deposit polling (Ethereum mainnet). Import only from {@link WorkerModule}.
 */
@Module({
  imports: [PrismaModule, WalletDepositsModule, TelegramModule, OpsAlertsModule],
  providers: [EthereumJsonRpcClient, Erc20DepositPollerService],
})
export class Erc20DepositWorkerModule {}
