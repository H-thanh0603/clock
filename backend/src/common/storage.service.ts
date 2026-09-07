import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";

export type StoredFile = { url: string; storage: "s3" | "disk" };

/**
 * Lưu file upload: S3-compatible (AWS S3, Cloudflare R2, MinIO...) nếu cấu hình
 * S3_BUCKET + S3_* env; không thì fallback disk như cũ. API upload không cần
 * biết backend đang mode nào — trả về url public cho admin dán vào product.
 */
export class StorageService {
  private s3?: S3Client;
  private bucket?: string;
  private publicBase?: string;

  constructor() {
    const bucket = process.env.S3_BUCKET?.trim();
    if (bucket) {
      this.bucket = bucket;
      this.publicBase = (process.env.S3_PUBLIC_BASE ?? "").replace(/\/$/, "");
      this.s3 = new S3Client({
        region: process.env.S3_REGION ?? "auto",
        endpoint: process.env.S3_ENDPOINT?.trim() || undefined,
        forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "1",
      });
    }
  }

  get mode(): "s3" | "disk" {
    return this.s3 ? "s3" : "disk";
  }

  private diskDir(): string {
    const dir = process.env.UPLOADS_DIR ?? join(process.cwd(), "uploads");
    mkdirSync(dir, { recursive: true });
    return dir;
  }

  async put(key: string, body: Buffer, contentType: string): Promise<StoredFile> {
    if (this.s3 && this.bucket) {
      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
          CacheControl: "public, max-age=31536000, immutable",
        })
      );
      // Ưu tiên custom domain / CDN; không có thì dùng endpoint bucket.
      const base = this.publicBase
        ? this.publicBase
        : `${process.env.S3_ENDPOINT?.replace(/\/$/, "") ?? `https://${this.bucket}.s3.${process.env.S3_REGION ?? "auto"}.amazonaws.com`}`;
      return { url: `${base}/${key}`, storage: "s3" };
    }
    const dir = this.diskDir();
    writeFileSync(join(dir, key), body);
    return { url: `/uploads/${key}`, storage: "disk" };
  }
}
