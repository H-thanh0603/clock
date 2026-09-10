import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Build standalone để đóng Docker image nhỏ (server.js tự chủ).
  output: "standalone",
  async rewrites() {
    // Prod sau Caddy: client gọi cùng-origin /backend/* → proxy sang API,
    // cookie thành first-party (không cần SameSite=None).
    const backend = process.env.BACKEND_URL;
    if (!backend) return [];
    return [
      { source: "/backend/:path*", destination: `${backend}/:path*` },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

// Sentry source maps — upload khi có SENTRY_AUTH_TOKEN (CI),
// thiếu token thì bỏ qua êm, build vẫn xanh (audit OBS-001).
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  // Prod chạy sau Caddy + không cần sourcemap công khai.
  sourcemaps: {
    disable: !process.env.SENTRY_AUTH_TOKEN,
  },
  silent: true,
});
