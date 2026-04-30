import { Module } from '@nestjs/common';
import { PrismaModule } from '../../config/prisma.module';
import { HashicorpVaultTransitService } from './hashicorp-vault-transit.service';
import { InternalApiKeyGuard } from '../../common/guards/internal-api-key.guard';
import { InternalWalletsController } from './internal-wallets.controller';
import { HashicorpVaultService } from './hashicorp-vault.service';
import { TraderWalletsService } from './trader-wallets.service';

@Module({
  imports: [PrismaModule],
  controllers: [InternalWalletsController],
  providers: [
    InternalApiKeyGuard,
    HashicorpVaultService,
    HashicorpVaultTransitService,
    TraderWalletsService,
  ],
  exports: [HashicorpVaultService, HashicorpVaultTransitService, TraderWalletsService],
})
export class TraderWalletsModule {}
