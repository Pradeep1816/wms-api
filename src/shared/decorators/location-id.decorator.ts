import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const LocationId = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): number => {
    const request = ctx.switchToHttp().getRequest();
    return request.location?.id;
  },
);


