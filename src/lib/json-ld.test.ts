import { describe, expect, it } from "vitest";
import { safeJsonLd } from "@/lib/json-ld";

describe("safeJsonLd", () => {
  it("escape </script> trong dữ liệu (XSS breakout)", () => {
    const out = safeJsonLd({ name: '</script><script>alert(1)</script>' });
    expect(out).not.toContain("</script>");
    expect(out).toContain("\\u003c/script>");
    // JSON parse vẫn ra đúng chuỗi gốc
    expect(JSON.parse(out)).toEqual({ name: '</script><script>alert(1)</script>' });
  });

  it("dữ liệu thường không đổi", () => {
    expect(safeJsonLd({ a: 1 })).toBe('{"a":1}');
  });
});
