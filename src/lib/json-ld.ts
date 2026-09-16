/**
 * Serialize an toàn cho <script type="application/ld+json">.
 * JSON.stringify không escape `/` nên chuỗi `</script>` trong dữ liệu
 * (vd. tên sản phẩm do admin nhập) sẽ đóng thẻ script sớm → XSS.
 * Thay `<` bằng \u003c — JSON parse vẫn ra đúng chuỗi gốc.
 */
export function safeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function stripSlash(v: string): string {
  return v.replace(/\/$/, "");
}

/**
 * Path tương đối → URL tuyệt đối cho JSON-LD (P2-6): Google bỏ qua image
 * tương đối khi render rich result. Chỉ dùng ở Server Components.
 */
function absolutize(path: string, base: string): string {
  const p = String(path ?? "");
  if (!p.startsWith("/")) return p;
  const b = stripSlash(base);
  return b ? `${b}${p}` : p;
}

/** Ảnh: ưu tiên CDN media (nơi file thật sự resolve), fallback SITE_URL. */
export function absoluteMediaUrl(path: string): string {
  return absolutize(
    path,
    process.env.NEXT_PUBLIC_MEDIA_BASE_URL ?? process.env.SITE_URL ?? "",
  );
}

/** URL trang (breadcrumb...): luôn SITE_URL, không bao giờ CDN media. */
export function absoluteSiteUrl(path: string): string {
  return absolutize(path, process.env.SITE_URL ?? "");
}
