import type { Product } from "@/data/products";
import { apiJson } from "@/lib/api";

/**
 * Data-access đọc catalog từ backend NestJS riêng (thay cho Prisma trực tiếp).
 */

export type ProductPage = {
  items: Product[];
  total: number;
  page: number;
  limit: number;
};

export type ProductListParams = {
  q?: string;
  collection?: string;
  sort?: "featured" | "price-asc" | "price-desc" | "newest";
  page?: number;
  limit?: number;
};

/** Trang catalog có phân trang/search/sort (cho /collections). */
export async function getProductPage(
  params: ProductListParams = {}
): Promise<ProductPage> {
  const qs = new URLSearchParams();
  if (params.q) qs.set("q", params.q);
  if (params.collection) qs.set("collection", params.collection);
  if (params.sort) qs.set("sort", params.sort);
  if (params.page) qs.set("page", String(params.page));
  if (params.limit) qs.set("limit", String(params.limit));
  const q = qs.toString();
  return apiJson<ProductPage>(`/products${q ? `?${q}` : ""}`, {
    next: { revalidate: 60 },
  });
}

/** Toàn bộ catalog (cho admin). Giữ chữ ký cũ trả Product[]. */
export async function getProducts(): Promise<Product[]> {
  const page = await apiJson<ProductPage>("/products?limit=50", {
    next: { revalidate: 60 },
  });
  return page.items;
}

export async function getProduct(slug: string): Promise<Product | null> {
  try {
    return await apiJson<Product>(`/products/${encodeURIComponent(slug)}`, {
      next: { revalidate: 60 },
    });
  } catch {
    return null;
  }
}
