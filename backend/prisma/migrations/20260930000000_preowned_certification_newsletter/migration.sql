-- Certified Pre-Owned: chứng nhận minh bạch cho dòng hàng hiệu cũ (định hướng thị trường 2026)
ALTER TABLE "Product" ADD COLUMN "condition" TEXT;
ALTER TABLE "Product" ADD COLUMN "certifiedBy" TEXT;
ALTER TABLE "Product" ADD COLUMN "certifiedAt" TIMESTAMP(3);
ALTER TABLE "Product" ADD COLUMN "serviceHistory" JSONB;
ALTER TABLE "Product" ADD COLUMN "ratingValue" DOUBLE PRECISION;
ALTER TABLE "Product" ADD COLUMN "ratingCount" INTEGER;

-- List trang /pre-owned lọc theo condition
CREATE INDEX "Product_condition_idx" ON "Product"("condition");

-- Nurture: đăng ký email từ footer
CREATE TABLE "NewsletterSubscriber" (
    "email" TEXT NOT NULL,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NewsletterSubscriber_pkey" PRIMARY KEY ("email")
);
