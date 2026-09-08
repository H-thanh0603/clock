import { redirect } from "next/navigation";
import { getProductPage } from "@/lib/db";
import { ProductManager } from "./ProductManager";

export default async function AdminProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const pageNum = Math.max(1, Number(sp.page) || 1);
  // Backoffice cần dữ liệu mới nhất — không dùng revalidate cache.
  const data = await getProductPage(
    { page: pageNum, limit: 20, q: sp.q },
    { noStore: true }
  ).catch(() => null);
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
