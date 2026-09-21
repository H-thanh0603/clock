"use client";

/**
 * LocaleProvider: ngôn ngữ hiển thị của toàn site (vi | en).
 *
 * Thiết kế cho đồ án luxury song ngữ:
 * - Mặc định `vi` (khách nội địa), user chuyển tay qua nút VI/EN ở Header.
 * - Lưu localStorage `aurel-locale` → giữ lựa chọn qua lần thăm sau.
 * - KHÔNG dùng route /[locale] (không đụng 30+ route hiện có, không gãy SEO/link cũ).
 * - KHÔNG thêm dep (next-intl/next-i18n) — chỉ 1 context + 1 file dict.
 *
 * Quy ước cho người dịch thêm chuỗi mới:
 * 1. Thêm key vào CẢ `vi` và `en` trong `src/i18n/dict.ts` (thiếu 1 bên là
 *    typecheck báo ngay — `LocaleDict` bắt 2 locale giống key nhau).
 * 2. Component chỉ gọi `t("section.key")` — không hardcode tiếng Việt/Anh.
 * 3. Câu dài/HTML/marketing cứ để nguyên tiếng Việt trong JSX khi chưa có
 *    bản dịch: vẫn tốt hơn chặn render; nhưng trang phải render được (lỗi
 *    thiếu key sẽ hiện key thô — dễ phát hiện khi review).
 *
 * Phạm vi đợt 1: Header/Footer/nav, nút giỏ hàng, trang chủ hero,
 * checkout/cart hiển thị cơ bản. Admin giữ tiếng Việt (nội bộ).
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { dict, type Locale, type LocaleDict, type TKey } from "@/i18n/dict";

const STORAGE_KEY = "aurel-locale";

type LocaleContextValue = {
  locale: Locale;
  setLocale: (l: Locale) => void;
  /**
   * Dịch key; hỗ trợ nội suy `{name}` qua vars (vd t("cart.valueLine",
   * { n: totalQty })). Thiếu key → hiện key thô (fail-loud để review).
   */
  t: (key: TKey, vars?: Record<string, string | number>) => string;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

function readStored(): Locale {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === "en" ? "en" : "vi";
  } catch {
    return "vi";
  }
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("vi");

  useEffect(() => {
    const l = readStored();
    setLocaleState(l);
    document.documentElement.lang = l;
  }, []);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {
      // storage đầy/blocked — vẫn đổi ngôn ngữ cho phiên hiện tại.
    }
    document.documentElement.lang = l;
  }, []);

  const t = useCallback(
    (key: TKey, vars?: Record<string, string | number>): string => {
      const hit = (dict[locale] as LocaleDict)[key];
      const raw =
        typeof hit === "string" && hit.length > 0
          ? hit
          : ((dict.vi as LocaleDict)[key] ?? key);
      if (!vars) return raw;
      // Nội suy {name} — chỉ thay key có trong vars, còn lại giữ nguyên.
      return raw.replace(/\{(\w+)\}/g, (m, k: string) =>
        k in vars ? String(vars[k]) : m,
      );
    },
    [locale]
  );

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useLocale phải dùng trong LocaleProvider");
  return ctx;
}
