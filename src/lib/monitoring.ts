/**
 * Sentry client (browser) — optional qua NEXT_PUBLIC_SENTRY_DSN.
 * Import từ Header (client component luôn mount) để init sớm nhất.
 * Không set DSN → mọi hàm noop, không tốn tài nguyên (audit OBS-001).
 */
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? "production",
    tracesSampleRate: Number(
      process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? 0.1,
    ),
    sendDefaultPii: false,
  });
}

/** Bắt lỗi client từ error boundary (error.tsx gọi khi UI crash). */
export function captureClientError(e: unknown) {
  if (dsn) Sentry.captureException(e);
}
