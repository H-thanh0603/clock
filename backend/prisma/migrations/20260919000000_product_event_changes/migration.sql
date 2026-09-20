-- AlterTable: ProductEvent.changes (diff old/new từng field khi admin/agent sửa SP)
ALTER TABLE "ProductEvent" ADD COLUMN "changes" JSONB;
