import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { captureException } from './observability';

/**
 * Filter toàn cục: mọi exception chưa xử lý đều được capture vào Sentry
 * (nếu cấu hình SENTRY_DSN) kèm request-id, rồi delegate cho handler mặc
 * định của Nest để response JSON lỗi giữ nguyên format client đang expect.
 */
@Catch()
export class SentryAllExceptionsFilter extends BaseExceptionFilter {
  private readonly log = new Logger('Exceptions');

  override catch(exception: unknown, host: ArgumentsHost) {
    const req = host.switchToHttp().getRequest<import('express').Request>();
    const requestId = req?.requestId;

    // 4xx client-error (BadRequest, Unauthorized...) là luồng bình thường
    // của API — chỉ capture 5xx và exception lạ (không phải HttpException).
    const isClientError =
      exception instanceof HttpException &&
      exception.getStatus() < 500;
    if (!isClientError) {
      if (requestId) {
        (exception as { requestId?: string }).requestId = requestId;
      }
      captureException(exception);
      this.log.error(
        `Unhandled: ${req?.method} ${req?.originalUrl} [${requestId ?? 'no-id'}]`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    super.catch(exception, host);
  }

  // Giữ TS yên tĩnh về HttpStatus (đánh dấu dùng cho logger tỷ lệ).
  static readonly _httpStatusProbe = HttpStatus;
}
