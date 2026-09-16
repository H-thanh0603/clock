/**
 * Chuẩn hóa liên lạc để so khớp sở hữu đơn (hủy/tra cứu đơn vãng lai).
 *
 * Vấn đề: cùng 1 SĐT nhưng khách nhập mỗi lần một kiểu (090..., +84...,
 * 84..., 0084..., kèm khoảng trắng/gạch) — so sánh thô làm khách không hủy
 * được đơn của chính mình. Chuẩn hóa cả 2 vế về 0xxxxxxxxx rồi so.
 */

/** SĐT di động VN → 0xxxxxxxxx (10 số). Không phải di động VN → null. */
export function normalizeVnPhone(raw: unknown): string | null {
  let s = String(raw ?? '').trim();
  if (!s) return null;
  // Bỏ phân tách thường gặp khi nhập tay.
  s = s.replace(/[\s.\-()]/g, '');
  if (s.startsWith('+84')) s = `0${s.slice(3)}`;
  else if (s.startsWith('0084')) s = `0${s.slice(4)}`;
  else if (s.startsWith('84') && s.length === 11) s = `0${s.slice(2)}`;
  // Di động VN: 03/05/07/08/09 + 8 số. Cố định (024/028...) và số ngoại
  // không ép — trả null để caller fallback so sánh thô.
  if (!/^0(3|5|7|8|9)\d{8}$/.test(s)) return null;
  return s;
}

/**
 * Hai contact có phải cùng chủ: cùng SĐT (mọi cách viết) hoặc cùng chuỗi
 * (email — không phân biệt hoa thường). Rỗng → false.
 */
export function sameContact(a: unknown, b: unknown): boolean {
  const x = String(a ?? '').trim();
  const y = String(b ?? '').trim();
  if (!x || !y) return false;
  const px = normalizeVnPhone(x);
  const py = normalizeVnPhone(y);
  if (px && py) return px === py;
  return x.toLowerCase() === y.toLowerCase();
}
