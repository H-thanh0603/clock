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
  /** Lọc dòng Certified Pre-Owned / hàng mới. */
  condition?: "PRE_OWNED" | "NEW";
  minUsd?: number;
  maxUsd?: number;
};

/** Trang catalog có phân trang/search/sort. opts.noStore cho backoffice. */
export async function getProductPage(
  params: ProductListParams = {},
  opts: { noStore?: boolean } = {}
): Promise<ProductPage> {
  const qs = new URLSearchParams();
  if (params.q) qs.set("q", params.q);
  if (params.collection) qs.set("collection", params.collection);
  if (params.sort) qs.set("sort", params.sort);
  if (params.page) qs.set("page", String(params.page));
  if (params.limit) qs.set("limit", String(params.limit));
  if (params.condition) qs.set("condition", params.condition);
  if (params.minUsd) qs.set("minUsd", String(params.minUsd));
  if (params.maxUsd) qs.set("maxUsd", String(params.maxUsd));
  const q = qs.toString();
  return apiJson<ProductPage>(`/products${q ? `?${q}` : ""}`, {
    ...(opts.noStore ? { cache: "no-store" as const } : { next: { revalidate: 60 } }),
  });
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
