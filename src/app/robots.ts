import type { MetadataRoute } from "next";

/** robots.txt: cho crawler toàn site, chặn backoffice + API. */
export default function robots(): MetadataRoute.Robots {
  const base = (process.env.SITE_URL ?? "").replace(/\/$/, "");
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/backend", "/api", "/checkout", "/cart", "/orders", "/account", "/login"],
      },
    ],
    sitemap: base ? `${base}/sitemap.xml` : undefined,
  };
}
