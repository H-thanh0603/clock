import { defineConfig } from "@playwright/test";

/**
 * E2E (P2-4): luồng mua hàng khách vãng lai trên stack dev thật
 * (FE :3100 + BE :4000 + Postgres dev).
 *
 * Chạy local:
 *   1. docker compose up -d db backend   (đã migrate + seed)
 *   2. npm run test:e2e
 * FE dev tự khởi động qua webServer bên dưới. Không cần AGENT_API_KEY
 * (không chạm agent host).
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: "http://localhost:3100",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev -- --port 3100",
    url: "http://localhost:3100",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      BACKEND_URL: "http://localhost:4000",
      NEXT_PUBLIC_BACKEND_URL: "http://localhost:4000",
    },
  },
});
