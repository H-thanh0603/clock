import type { Product } from "@/data/products";
import { apiJson } from "@/lib/api";

/**
 * Data-access đọc catalog từ backend NestJS riêng (thay cho Prisma trực tiếp).
 * Giữ nguyên chữ ký getProducts/getProduct để callers không đổi.
 */
export async function getProducts(): Promise<Product[]> {
  const rows = await apiJson<Product[]>("/products", {
    forwardCookies: false,
  });
  return rows;
}

export async function getProduct(slug: string): Promise<Product | null> {
  try {
    return await apiJson<Product>(`/products/${encodeURIComponent(slug)}`);
  } catch {
    return null;
  }
}
