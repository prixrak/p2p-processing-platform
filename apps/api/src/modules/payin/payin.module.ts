import { Module } from '@nestjs/common';
import { PayinService } from './payin.service';
import { PayinController, PayinInternalController } from './payin.controller';
import { PaymentPageController } from './payment-page.controller';
import { RequisitesModule } from '../requisites/requisites.module';
import { BanksModule } from '../banks/banks.module';
import { FilesModule } from '../files/files.module';

@Module({
  imports: [RequisitesModule, BanksModule, FilesModule],
  controllers: [PayinController, PayinInternalController, PaymentPageController],
  providers: [PayinService],
  exports: [PayinService],
})
export class PayinModule {}
