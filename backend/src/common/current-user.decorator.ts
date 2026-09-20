import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { ACTOR_HEADER, resolveActor, type SessionUser } from './session';

/** Lấy session user đã gắn bởi guard (null nếu khách). */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): SessionUser | null => {
    const req = ctx.switchToHttp().getRequest<Request>();
    return req.sessionUser ?? null;
  },
);

/**
 * Danh tính ghi audit trail: `byUserId` của phiên, TRỪ khi agent delegation
 * tự khai `x-aurel-actor` hợp lệ → id:agent/... (xem `resolveActor`).
 */
export const ActorId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | undefined => {
    const req = ctx.switchToHttp().getRequest<Request>();
    const raw = req.headers[ACTOR_HEADER];
    return resolveActor(
      req.sessionUser,
      Array.isArray(raw) ? raw[0] : raw,
    );
  },
);
