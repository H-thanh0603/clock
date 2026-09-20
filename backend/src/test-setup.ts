/**
 * Setup chạy 1 lần/worker TRƯỚC mọi test file: cố định JWT_SECRET cho cả
 * tiến trình vitest.
 *
 * Lý do: `sessionSecret()` đọc `process.env.JWT_SECRET` MỖI lần ký/verify,
 * trong khi 4 test file cũ gán `process.env.JWT_SECRET = ...` giữa chừng
 * (top-level + beforeEach). Vitest chạy các file song song → secret bị xoay
 * dưới chân nhau → vé ký trước verify bằng secret khác → fail flaky, chỉ nổ
 * khi chạy full suite (`npx vitest run 1 file` thì xanh).
 *
 * Quy ước từ nay: KHÔNG gán `process.env.JWT_SECRET` trong test nữa. Test
 * nào cần secret riêng thì mock `sessionSecret()` thay vì đụng env chung.
 */
if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = `TEST_JWT_SECRET_${Date.now()}`;
}
