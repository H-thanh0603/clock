-- CreateIndex
CREATE INDEX "Product_collection_priceUsd_idx" ON "Product"("collection", "priceUsd");

-- CreateIndex
CREATE INDEX "Product_createdAt_idx" ON "Product"("createdAt");
