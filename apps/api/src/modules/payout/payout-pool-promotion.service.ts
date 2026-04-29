import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PayoutService } from './payout.service';

@Injectable()
export class PayoutPoolPromotionService {
  constructor(private readonly payoutService: PayoutService) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async promoteStalePoolOrders(): Promise<void> {
    await this.payoutService.promoteStaleStandardPoolOrders();
  }
}
