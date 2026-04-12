import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const MerchantId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest();
    return request.merchantId;
  },
);
