-- Snapshot giá gốc promotion (JSONB nullable) — cron hết hạn hồi giá từ đây.
-- CHÚ Ý: đã xóa tay 2 dòng DROP INDEX trgm do `migrate dev` tưởng nhầm là
-- drift (xem chú thích trong migration invoice_amount_bigint).

-- AlterTable
ALTER TABLE "Promotion" ADD COLUMN     "priceSnapshot" JSONB;
