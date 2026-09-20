import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    setupFiles: ['./src/test-setup.ts'],
    // Mỗi file test 1 process riêng: cách ly process.env (JWT_SECRET...)
    // giữa các file. Chạy song song mặc định của vitest dùng chung process
    // → file A xoay env làm file B fail flaky. Đánh đổi: chậm hơn ~1-2s.
    pool: 'forks',
  },
});
