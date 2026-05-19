import { Module } from '@nestjs/common';
import { PrismaModule } from '../../config/prisma.module';
import { TraderWalletsModule } from '../trader-wallets/trader-wallets.module';
import { WalletDepositsModule } from '../wallet-deposits/wallet-deposits.module';
import { TronEnergyDelegationService } from './tron-energy-delegation.service';
import { WalletSweepService } from './wallet-sweep.service';

@Module({
  imports: [PrismaModule, TraderWalletsModule, WalletDepositsModule],
  providers: [TronEnergyDelegationService, WalletSweepService],
})
export class WalletSweepWorkerModule {}
