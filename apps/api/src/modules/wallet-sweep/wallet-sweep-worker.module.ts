import { Module } from '@nestjs/common';
import { PrismaModule } from '../../config/prisma.module';
import { TraderWalletsModule } from '../trader-wallets/trader-wallets.module';
import { TrongridClient } from '../wallet-deposits/trongrid.client';
import { TronEnergyDelegationService } from './tron-energy-delegation.service';
import { WalletSweepService } from './wallet-sweep.service';

@Module({
  imports: [PrismaModule, TraderWalletsModule],
  providers: [TrongridClient, TronEnergyDelegationService, WalletSweepService],
})
export class WalletSweepWorkerModule {}
