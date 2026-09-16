/**
 * Guard seed: seed demo chỉ được UPDATE sản phẩm do chính seed tạo ra và
 * CHƯA AI SỬA. Merchant sửa giá/mô tả xong mà chạy lại seed thì toàn bộ
 * công sức bị ghi đè âm thầm (audit P1-4) — mất tiền thật theo nghĩa đen
 * nếu giá bị revert về giá demo.
 *
 * Quy ước: row do seed tạo có updatedAt ≈ createdAt (cùng ms lúc insert).
 * Admin chạm vào → @updatedAt nhảy. Dung sai 60s cho lệch clock/batch.
 */
export const SEED_TOUCH_TOLERANCE_MS = 60_000;

/** true = seed được phép update (row "nguyên zin" từ seed). */
export function isSeedManaged(createdAt: Date, updatedAt: Date): boolean {
  return (
    updatedAt.getTime() <= createdAt.getTime() + SEED_TOUCH_TOLERANCE_MS
  );
}
