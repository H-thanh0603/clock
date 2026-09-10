import { redirect } from "next/navigation";
import { apiJson } from "@/lib/api";
import { ProductManager } from "./ProductManager";

/** Gọi /admin/products (backend forward cookie phiên admin) — thấy cả
 *  SP ẩn, khác catalog public /products giờ chỉ hiện inBoutique=true. */
async function getAdminProductPage(
  page: number,
  q?: string
): Promise<{
  items: import("@/data/products").Product[];
  total: number;
  page: number;
  limit: number;
} | null> {
  const qs = new URLSearchParams({
    page: String(page),
    limit: "20",
    ...(q ? { q } : {}),
  });
  const data = await apiJson<{
    items: import("@/data/products").Product[];
    total: number;
    page: number;
    limit: number;
  }>(`/admin/products?${qs}`, { forwardCookies: true }).catch(() => null);
  return data;
}

export default async function AdminProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const pageNum = Math.max(1, Number(sp.page) || 1);
  // Backoffice cần dữ liệu mới nhất — không dùng revalidate cache.
  const data = await getAdminProductPage(pageNum, sp.q);
  if (!data) redirect("/login?next=/admin/products");

  return (
    <div>
      <span className="font-label-spec text-label-spec tracking-[0.35em] text-secondary uppercase">
        Atelier Admin • Catalog
      </span>
      <h1 className="font-display mt-3 text-4xl font-medium">
        Quản Lý <span className="text-gold-gradient">Sản Phẩm</span>
      </h1>
      <ProductManager
        items={data.items}
        total={data.total}
        page={data.page}
        limit={data.limit}
        q={sp.q ?? ""}
      />
    </div>
  );
}
