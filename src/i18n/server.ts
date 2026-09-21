import type { Locale, TKey } from "./dict";
import { dict } from "./dict";

/**
 * Dịch server-side (server component không dùng được context client).
 * Đọc `dict` trực tiếp theo locale từ cookie — cùng nguồn với LocaleProvider.
 */
export async function serverT(locale: Locale) {
  return {
    t: (key: TKey): string => {
      const hit = dict[locale][key];
      if (typeof hit === "string" && hit.length > 0) return hit;
      const fb = dict.vi[key];
      return typeof fb === "string" && fb.length > 0 ? fb : key;
    },
  };
}
