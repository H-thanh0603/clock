import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'crypto';
import * as Sentry from '@sentry/node';
import type { NextFunction, Request, Response } from 'express';

/**
 * Observability tối giản (audit OBS-001): request-id + Sentry (optional).
 *
 * SENTRY_DSN được set → capture exception + performance trace; bỏ trống
 * thì mọi hàm đều noop an toàn (dev/CI không cần DSN).
 * Cấu hình qua .env.prod:
 *   SENTRY_DSN=https://xxx@sentry.io/yyy
 * Có thể thêm SENTRY_ENVIRONMENT (vd "prod-vps") để phân biệt môi trường.
 */

let initialized = false;

export function initObservability(): void {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return; // Không cấu hình → noop hết, không tốn tài nguyên.
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT ?? 'production',
    // Traces 10% là đủ cho shop nhỏ tìm lỗi chậm; cần đột biến điều tra
    // thì nâng SENTRY_TRACES_SAMPLE_RATE.
    tracesSampleRate: Number(
      process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1,
    ),
    // Chỉ gửi khi có lỗi — không spam event info.
    sendDefaultPii: false,
  });
  initialized = true;
}

export function captureException(e: unknown): void {
  if (initialized) Sentry.captureException(e);
}

export function setRequestUser(user: {
  id: string;
  email?: string;
}): void {
  if (!initialized) return;
  Sentry.setUser({ id: user.id, email: user.email });
}

declare module 'express' {
  interface Request {
    requestId?: string;
  }
}

/**
 * Middleware gắn request-id vào req + header response X-Request-Id.
 * Log Nest và Sentry đều có scope requestId → ghép chuỗi được khi debug.
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  private readonly log = new Logger('Http');

  use(req: Request, res: Response, next: NextFunction) {
    const id = randomUUID().slice(0, 8);
    req.requestId = id;
    res.setHeader('X-Request-Id', id);

    // Capture 4xx/5xx vào Sentry kèm requestId — 2xx/3xx bỏ qua.
    const start = Date.now();
    res.on('finish', () => {
      const ms = Date.now() - start;
      const msg = `${req.method} ${req.originalUrl} ${res.statusCode} ${ms}ms [${id}]`;
      if (res.statusCode >= 500) {
        this.log.error(msg);
        if (initialized) {
          Sentry.withScope((scope) => {
            scope.setContext('request', {
              id,
              method: req.method,
              url: req.originalUrl,
              statusCode: res.statusCode,
            });
            Sentry.captureMessage(`HTTP ${res.statusCode} ${req.method} ${req.originalUrl}`, 'error');
          });
        }
      } else if (res.statusCode >= 400) {
        // 4xx thường là lỗi client/throttle — log warn, không gửi Sentry.
        this.log.warn(msg);
      } else {
        this.log.log(msg);
      }
    });
    next();
  }
}
