import {
  ForbiddenException,
  Injectable,
  NestMiddleware,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { Request, Response, NextFunction } from 'express';

export const CSRF_COOKIE = 'aurel_csrf';
const CSRF_HEADER = 'x-csrf-token';

/**
 * Double-submit CSRF: client đọc token từ cookie (readable) và gửi lại
 * qua header. Áp dụng cho mọi POST/PATCH/PUT/DELETE trừ login/register
 * (chưa có session để tấn công session-riding).
 */
@Injectable()
export class CsrfMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction) {
    // NOTE: middleware mount ở '*' nên req.path bị strip — dùng originalUrl.
    const path = (req.originalUrl || req.url || '').split('?')[0];
    if (!['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method)) {
      return next();
    }
    if (
      path === '/auth/login' ||
      path === '/auth/register' ||
      path === '/auth/csrf'
    ) {
      return next();
    }
    const cookie = req.cookies?.[CSRF_COOKIE];
    const header = req.headers[CSRF_HEADER];
    if (
      typeof cookie !== 'string' ||
      cookie.length < 16 ||
      cookie !== header
    ) {
      throw new ForbiddenException('Thiếu hoặc sai CSRF token');
    }
    next();
  }
}

export function newCsrfToken(): string {
  return randomBytes(24).toString('hex');
}
