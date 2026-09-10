/** Body tạo inquiry — validate thủ công gọn (không cần class-validator). */
export type CreateInquiryDto = {
  type: string;
  name: string;
  phone: string;
  email?: string;
  message?: string;
  /** Cấu hình configurator (movement/case/dial/personal, estimatedUsd...) */
  payload?: Record<string, unknown> | null;
};

/** Giới hạn payload JSON trước khi chạm DB (audit DATA-001: spam vector). */
export const PAYLOAD_MAX_BYTES = 4000;

/**
 * Chuẩn hóa payload configurator: giới hạn 4KB serialized, sâu tối đa 3
 * tầng, key/value là scalar. Trả về object sạch hoặc null nếu rác/too lớn.
 */
export function normalizePayload(
  input: unknown,
): Record<string, unknown> | null {
  if (input == null || typeof input !== 'object' || Array.isArray(input))
    return null;

  const flatten = (obj: Record<string, unknown>, depth: number): unknown => {
    if (depth > 3) return '[...]';
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj).slice(0, 30)) {
      if (v === null || typeof v !== 'object') {
        // Scalar: giữ nguyên — toString khi render.
        out[k] = v;
      } else if (Array.isArray(v)) {
        // Mảng scalar: giữ tối đa 10 phần tử.
        out[k] = v.slice(0, 10).map((x) =>
          x !== null && typeof x === 'object' ? '[…]' : x,
        );
      } else {
        out[k] = flatten(v as Record<string, unknown>, depth + 1);
      }
    }
    return out;
  };

  let normalized = flatten(input as Record<string, unknown>, 0);
  // Cap 4KB serialized — vượt thì drop trường theo thứ tự cho tới khi vừa.
  while (
    JSON.stringify(normalized).length > PAYLOAD_MAX_BYTES &&
    normalized &&
    typeof normalized === 'object'
  ) {
    const keys = Object.keys(normalized);
    if (keys.length === 0) return null;
    normalized = Object.fromEntries(keys.slice(0, -1).map((k) => [k, (normalized as Record<string, unknown>)[k]]));
  }
  const s = JSON.stringify(normalized);
  if (s.length > PAYLOAD_MAX_BYTES) return null;
  return normalized as Record<string, unknown>;
}
