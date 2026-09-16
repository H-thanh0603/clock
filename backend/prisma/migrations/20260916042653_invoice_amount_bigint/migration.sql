-- Invoice.amountVnd Int → BigInt: đơn flagship $145k × 25.200 = 3,65 tỷ VND,
-- vượt trần Int32 (2.147.483.647) — Int làm invoice đơn lớn throw âm thầm.
-- CHÚ Ý: KHÔNG để `prisma migrate dev` tự thêm DROP INDEX cho 2 index trgm
-- (Product_name_trgm_idx / Product_reference_trgm_idx) vào file này — chúng
-- được quản lý bằng raw SQL ở migration product_trgm_search, vô hình với
-- schema nên migrate dev luôn tưởng là drift. Deploy file có DROP đó lên
-- prod sẽ mất index search. Đã từng suýt xảy ra ngày 16/09/2026.

-- AlterTable
ALTER TABLE "Invoice" ALTER COLUMN "amountVnd" SET DATA TYPE BIGINT;
