import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import type { SessionUser } from './session';

/** Lấy session user đã gắn bởi guard (null nếu khách). */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): SessionUser | null => {
    const req = ctx.switchToHttp().getRequest<Request>();
    return req.sessionUser ?? null;
  },
);
