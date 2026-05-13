import type { PrismaService } from '../../config/prisma.service';
import type { ProfileDto } from '@p2p/shared';
import { DirectionType } from '@p2p/shared';

/**
 * Build the merchant `info` payload used by both `POST /external/v1/payin/info` and
 * `POST /external/v1/payout/info`. Centralized to avoid the two formerly identical
 * snapshot blocks in `PayinService.getInfo` / `PayoutService.getInfo` drifting apart.
 *
 * `rate` is fixed to 1 because v2 settlement uses per-order snapshot rates from the parser —
 * kept for backward compatibility with older merchant API contracts.
 */
export async function buildMerchantProfileDto(
  prisma: PrismaService,
  merchantId: string,
  directionType: DirectionType,
): Promise<ProfileDto> {
  const merchant = await prisma.merchant.findUniqueOrThrow({
    where: { id: merchantId },
    include: { balances: { include: { currency: true } } },
  });

  const direction = await prisma.direction.findFirst({
    where: { type: directionType, isOnline: true },
  });

  const balances: Record<string, number> = {};
  for (const b of merchant.balances) {
    balances[b.currency.code] = Number(b.amount);
  }

  return {
    name: merchant.name,
    is_lock: merchant.isLock,
    balances,
    direction: direction
      ? {
          direction_name: direction.name,
          min_amount: Number(direction.minAmount),
          max_amount: Number(direction.maxAmount),
          rate: 1,
          percent: Number(direction.percentFee),
          online: direction.isOnline,
        }
      : {
          direction_name: '',
          min_amount: 0,
          max_amount: 0,
          rate: 0,
          percent: 0,
          online: false,
        },
  };
}
