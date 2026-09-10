-- Tìm kiếm catalog dùng ILIKE %q% (contains insensitive) trên Product.name
-- và Product.reference — seq scan theo catalog lớn (audit DB-001 mục search).
-- pg_trgm GIN index cho phép ILIKE dùng index thay vì quét toàn bảng.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX "Product_name_trgm_idx" ON "Product" USING gin ("name" gin_trgm_ops);
CREATE INDEX "Product_reference_trgm_idx" ON "Product" USING gin ("reference" gin_trgm_ops);
