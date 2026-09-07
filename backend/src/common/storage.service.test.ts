import { afterEach, describe, expect, it, vi } from "vitest";
import { rmSync } from "fs";
import { StorageService } from "./storage.service";

const restore = (key: string, value: string | undefined) => {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
};

const prev: Record<string, string | undefined> = {
  bucket: process.env.S3_BUCKET,
  region: process.env.S3_REGION,
  endpoint: process.env.S3_ENDPOINT,
  publicBase: process.env.S3_PUBLIC_BASE,
  uploadsDir: process.env.UPLOADS_DIR,
};

afterEach(() => {
  restore("S3_BUCKET", prev.bucket);
  restore("S3_REGION", prev.region);
  restore("S3_ENDPOINT", prev.endpoint);
  restore("S3_PUBLIC_BASE", prev.publicBase);
  restore("UPLOADS_DIR", prev.uploadsDir);
  vi.restoreAllMocks();
});

describe("StorageService", () => {
  it("không cấu hình S3 → mode disk, trả url /uploads/...", async () => {
    delete process.env.S3_BUCKET;
    process.env.UPLOADS_DIR = "/tmp/aurel-test-uploads";
    rmSync("/tmp/aurel-test-uploads", { recursive: true, force: true });
    const svc = new StorageService();
    expect(svc.mode).toBe("disk");
    const r = await svc.put("a-1.jpg", Buffer.from("x"), "image/jpeg");
    expect(r).toEqual({ url: "/uploads/a-1.jpg", storage: "disk" });
  });

  it("có S3_BUCKET → mode s3, putObject được gọi, url theo publicBase", async () => {
    process.env.S3_BUCKET = "aurel-media";
    process.env.S3_PUBLIC_BASE = "https://cdn.example.com";
    const sendSpy = vi.fn().mockResolvedValue({});
    const svc = new StorageService();
    // Override client thật bằng stub (private field, gán trực tiếp).
    Object.assign(svc, {
      s3: { send: sendSpy },
      bucket: "aurel-media",
    });
    expect(svc.mode).toBe("s3");
    const r = await svc.put("b-2.png", Buffer.from("y"), "image/png");
    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(r).toEqual({ url: "https://cdn.example.com/b-2.png", storage: "s3" });
  });
});
