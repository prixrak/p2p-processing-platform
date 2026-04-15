import { Module } from '@nestjs/common';
import { PrismaModule } from '../../config/prisma.module';
import { ReferralService } from './referral.service';
import { ReferralAdminController, ReferralCabinetController } from './referral.controller';

@Module({
  imports: [PrismaModule],
  controllers: [ReferralAdminController, ReferralCabinetController],
  providers: [ReferralService],
  exports: [ReferralService],
})
export class ReferralModule {}
