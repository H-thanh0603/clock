import { redirect } from "next/navigation";
import { getProducts } from "@/lib/db";
import { ProductManager } from "./ProductManager";

export default async function AdminProductsPage() {
  const products = await getProducts().catch(() => null);
  if (!products) redirect("/login?next=/admin/products");

  return (
    <div>
      <span className="font-label-spec text-label-spec tracking-[0.35em] text-secondary uppercase">
        Atelier Admin • Catalog
      </span>
      <h1 className="font-display mt-3 text-4xl font-medium">
        Quản Lý <span className="text-gold-gradient">Sản Phẩm</span>
      </h1>
      <ProductManager products={products} />
    </div>
  );
}
