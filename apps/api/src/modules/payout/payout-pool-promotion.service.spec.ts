import { PayoutPoolPromotionService } from './payout-pool-promotion.service';
import type { PayoutService } from './payout.service';

describe('PayoutPoolPromotionService', () => {
  it('delegates to PayoutService.promoteStaleStandardPoolOrders', async () => {
    const promoteStaleStandardPoolOrders = jest.fn(async () => 3);
    const payout = {
      promoteStaleStandardPoolOrders,
    } as unknown as PayoutService;
    const job = new PayoutPoolPromotionService(payout);
    await job.promoteStalePoolOrders();
    expect(promoteStaleStandardPoolOrders).toHaveBeenCalledTimes(1);
  });
});
