import { NextResponse } from "next/server";
import { getProduct } from "@/lib/db";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const product = await getProduct(slug);
    if (!product) {
      return NextResponse.json(
        { error: "Không tìm thấy sản phẩm" },
        { status: 404 }
      );
    }
    return NextResponse.json(product);
  } catch (e) {
    console.error("GET /api/products/[slug] failed:", e);
    return NextResponse.json({ error: "Lỗi đọc sản phẩm" }, { status: 500 });
  }
}
