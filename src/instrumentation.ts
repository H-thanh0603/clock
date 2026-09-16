/**
 * Sentry cho Next.js frontend — optional qua NEXT_PUBLIC_SENTRY_DSN.
 * Không set DSN → tất cả noop, không ảnh hưởng dev/CI (audit OBS-001).
 *
 * File này chạy ở server (server component + edge) và được import cả ở
 * client qua withSentryConfig bên next.config.ts.
 * @see https://docs.sentry.io/platforms/javascript/guides/nextjs/
 */
import * as Sentry from "@sentry/nextjs";

export function register() {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) {
    // noop — chưa cấu hình Sentry thì không init. Production mà trống thì
    // UI crash chết chìm: cảnh báo ở server log để operator nhớ điền.
    if (process.env.NODE_ENV === "production") {
      console.error(
        "[observability] NEXT_PUBLIC_SENTRY_DSN trống ở production — " +
          "UI crash sẽ KHÔNG báo về đâu. Điền DSN trước khi nhận đơn thật."
      );
    }
    return;
  }

  Sentry.init({
    dsn,
    environment:
      process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? "production",
    tracesSampleRate: Number(
      process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? 0.1,
    ),
    // Không bắt PII (tên/SĐT/địa chỉ khách) gửi lên SaaS bên thứ 3.
    sendDefaultPii: false,
  });
}
