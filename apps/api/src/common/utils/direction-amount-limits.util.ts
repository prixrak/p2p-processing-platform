import { BadRequestException } from '@nestjs/common';

/**
 * Enforces direction min/max for order amounts. Amounts of 0 mean unbounded (admin defaults).
 */
export function assertAmountWithinDirectionMinMax(
  amount: number,
  currencyCode: string,
  minAmount: unknown,
  maxAmount: unknown,
  scopeDescription: string,
): void {
  const minV = Number(minAmount);
  const maxV = Number(maxAmount);

  if (minV > 0 && amount + 1e-9 < minV) {
    throw new BadRequestException(
      `Order amount ${amount} is below the minimum ${minV} ${currencyCode} (${scopeDescription})`,
    );
  }
  if (maxV > 0 && amount - 1e-9 > maxV) {
    throw new BadRequestException(
      `Order amount ${amount} exceeds the maximum ${maxV} ${currencyCode} (${scopeDescription})`,
    );
  }
}
