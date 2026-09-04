import { NextResponse } from "next/server";
import { getProducts } from "@/lib/db";

export async function GET() {
  try {
    const products = await getProducts();
    return NextResponse.json(products);
  } catch (e) {
    console.error("GET /api/products failed:", e);
    return NextResponse.json(
      { error: "Không đọc được danh sách sản phẩm" },
      { status: 500 }
    );
  }
}
