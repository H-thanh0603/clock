import type { MetadataRoute } from "next";

/** robots.txt: cho crawler toàn site, chặn backoffice + API + machine endpoint. */
export default function robots(): MetadataRoute.Robots {
  const base = (process.env.SITE_URL ?? "").replace(/\/$/, "");
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/admin",
          "/backend",
          "/api",
          "/checkout",
          "/cart",
          "/orders",
          "/account",
          "/login",
          // Machine endpoint — agent ngoài đọc manifest rồi gọi đúng cửa.
          "/.well-known/agent",
          // Trang nội bộ cho visual regression (fixture, không giá trị SEO).
          "/widget-gallery",
        ],
      },
    ],
    sitemap: base ? `${base}/sitemap.xml` : undefined,
  };
}
