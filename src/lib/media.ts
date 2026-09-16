/**
 * URL media tĩnh (P2-6): prefix CDN khi cấu hình NEXT_PUBLIC_MEDIA_BASE_URL
 * (VD https://media.shop.example.com trỏ vào R2 chứa bản sync của public/).
 *
 * Quy tắc:
 * - Chỉ rewrite 2 cây tĩnh tự chủ: /images/* và
 *   /swiss-luxury-watches-and-chronographs/*.
 * - Giữ nguyên: URL tuyệt đối (http/https — gồm ảnh S3 upload), /uploads/*
 *   (backend serve/disk), data: URI, chuỗi rỗng.
 * - Base trống (dev/K8s chưa có CDN) → trả path gốc, hành vi y hệt cũ.
 */

const CDN_PREFIXES = [
  "/images/",
  "/swiss-luxury-watches-and-chronographs/",
];

export function mediaBase(): string {
  return (process.env.NEXT_PUBLIC_MEDIA_BASE_URL ?? "").replace(/\/$/, "");
}

/** Path public → URL hiển thị (dùng ở mọi <img>/<video>/<source> tĩnh). */
export function mediaUrl(path: string | null | undefined): string {
  const p = String(path ?? "");
  const base = mediaBase();
  if (!base || !p.startsWith("/")) return p;
  if (!CDN_PREFIXES.some((pre) => p.startsWith(pre))) return p;
  return `${base}${p}`;
}
