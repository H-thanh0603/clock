/**
 * Serialize an toàn cho <script type="application/ld+json">.
 * JSON.stringify không escape `/` nên chuỗi `</script>` trong dữ liệu
 * (vd. tên sản phẩm do admin nhập) sẽ đóng thẻ script sớm → XSS.
 * Thay `<` bằng \u003c — JSON parse vẫn ra đúng chuỗi gốc.
 */
export function safeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}
