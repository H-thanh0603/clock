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

describe("absoluteMediaUrl", () => {
  it("dev (không base) → giữ path gốc", async () => {
    delete process.env.NEXT_PUBLIC_MEDIA_BASE_URL;
    delete process.env.SITE_URL;
    const { absoluteMediaUrl } = await import("./json-ld");
    expect(absoluteMediaUrl("/images/a.jpg")).toBe("/images/a.jpg");
    expect(absoluteMediaUrl("https://x/y.jpg")).toBe("https://x/y.jpg");
  });

  it("ưu tiên CDN base, fallback SITE_URL", async () => {
    const { absoluteMediaUrl } = await import("./json-ld");
    process.env.SITE_URL = "https://shop.example.com";
    try {
      expect(absoluteMediaUrl("/images/a.jpg")).toBe(
        "https://shop.example.com/images/a.jpg"
      );
      process.env.NEXT_PUBLIC_MEDIA_BASE_URL = "https://media.example.com/";
      expect(absoluteMediaUrl("/images/a.jpg")).toBe(
        "https://media.example.com/images/a.jpg"
      );
    } finally {
      delete process.env.NEXT_PUBLIC_MEDIA_BASE_URL;
      delete process.env.SITE_URL;
    }
  });

  it("absoluteSiteUrl luôn SITE_URL, không dính CDN", async () => {
    const { absoluteSiteUrl } = await import("./json-ld");
    process.env.SITE_URL = "https://shop.example.com";
    process.env.NEXT_PUBLIC_MEDIA_BASE_URL = "https://media.example.com";
    try {
      expect(absoluteSiteUrl("/collections")).toBe(
        "https://shop.example.com/collections"
      );
    } finally {
      delete process.env.NEXT_PUBLIC_MEDIA_BASE_URL;
      delete process.env.SITE_URL;
    }
  });
});
