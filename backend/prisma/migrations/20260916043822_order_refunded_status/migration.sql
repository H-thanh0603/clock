-- Thêm trạng thái REFUNDED (đã hoàn tiền) cho OrderStatus — refund flow
-- tối thiểu (audit BIZ-HIGH-02).
-- CHÚ Ý (lặp lại từ migration invoice_amount_bigint): KHÔNG để
-- `prisma migrate dev` tự thêm DROP INDEX cho 2 index trgm vào file này —
-- chúng quản lý bằng raw SQL, migrate dev luôn tưởng là drift. Đã xóa tay
-- 2 dòng DROP đó trước khi apply.

-- AlterEnum
ALTER TYPE "OrderStatus" ADD VALUE 'REFUNDED';
