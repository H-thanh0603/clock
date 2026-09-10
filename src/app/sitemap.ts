import type { MetadataRoute } from "next";
import { apiJson } from "@/lib/api";

/**
 * Sitemap động: trang tĩnh + mọi sản phẩm đang trưng bày.
 * SITE_URL (vd https://shop.example.com) quyết định host tuyệt đối;
 * không set thì build vẫn ra nhưng host rỗng — nên set ở prod.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = (process.env.SITE_URL ?? "").replace(/\/$/, "");
  const now = new Date();

  const statics: MetadataRoute.Sitemap = [
    { url: `${base}/`, lastModified: now, changeFrequency: "daily", priority: 1 },
    {
      url: `${base}/collections`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${base}/atelier`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${base}/bespoke`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${base}/legal/privacy`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.1,
    },
    {
      url: `${base}/legal/terms`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.1,
    },
    {
      url: `${base}/legal/complaints`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.1,
    },
  ];

  // Catalog: mọi SP public (backend tự lọc inBoutique=true).
  try {
    const page = await apiJson<{
      items: { slug: string }[];
    }>("/products?limit=50&page=1&sort=newest", {
      next: { revalidate: 3600 },
    });
    const products: MetadataRoute.Sitemap = (page.items ?? []).map((p) => ({
      url: `${base}/products/${encodeURIComponent(p.slug)}`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.8,
    }));
    return [...statics, ...products];
  } catch {
    // Backend xuống → sitemap chỉ còn trang tĩnh, vẫn build được.
    return statics;
  }
}
