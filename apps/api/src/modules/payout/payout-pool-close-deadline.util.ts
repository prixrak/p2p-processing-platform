import { PayoutPoolType } from '@prisma/client';

/**
 * Mirrors pool SLA used for listing: when pool timeout is enabled, traders see a countdown
 * to the same anchor the promotion job uses (STANDARD: createdAt; pool B: poolAssignedAt or createdAt).
 */
export function computePayoutPoolCloseDeadline(input: {
  poolType: PayoutPoolType;
  createdAt: Date;
  poolAssignedAt: Date | null;
  poolTimeoutEnabled: boolean;
  poolTimeoutHours: number | null | undefined;
}): Date | null {
  if (
    !input.poolTimeoutEnabled ||
    input.poolTimeoutHours == null ||
    input.poolTimeoutHours < 1
  ) {
    return null;
  }
  const ms = input.poolTimeoutHours * 60 * 60 * 1000;
  if (input.poolType === PayoutPoolType.STANDARD) {
    return new Date(input.createdAt.getTime() + ms);
  }
  const anchor = input.poolAssignedAt ?? input.createdAt;
  return new Date(anchor.getTime() + ms);
}
