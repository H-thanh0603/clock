import { describe, expect, it } from "vitest";
import { dict } from "./dict";

/** Từ điển song ngữ: 2 locale phải khớp key 1-1 (thiếu là typecheck đã báo,
 *  test này chống value rỗng + chống quên dịch khi thêm key). */
describe("i18n dict", () => {
  it("vi và en có cùng tập key", () => {
    expect(new Set(Object.keys(dict.en))).toEqual(new Set(Object.keys(dict.vi)));
  });
  it("không value rỗng", () => {
    for (const [locale, d] of Object.entries(dict) as Array<[string, Record<string, string>]>) {
      for (const [k, v] of Object.entries(d)) {
        expect(v.length, `${locale}.${k}`).toBeGreaterThan(0);
      }
    }
  });
});
