import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth";
import {
  getCart,
  addToCart,
  updateCartQty,
  removeFromCart,
  clearCart,
} from "@/lib/cart";
import { prismaCartStorage as storage } from "@/lib/cartStorage";

/** GET /api/cart — liệt kê giỏ DB của user đang đăng nhập. */
export async function GET() {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  try {
    return NextResponse.json(await getCart(storage, session.id));
  } catch (e) {
    console.error("GET /api/cart failed:", e);
    return NextResponse.json({ error: "Lỗi đọc giỏ hàng" }, { status: 500 });
  }
}

type AddBody = {
  productSlug?: string;
  slug?: string;
  name: string;
  priceUsd: number;
  priceVnd?: number;
  image: string;
  strap?: string;
  engraving?: string;
  qty?: number;
};

export async function POST(req: Request) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  try {
    const b = (await req.json()) as AddBody;
    const outcome = await addToCart(storage, session.id, {
      slug: b.productSlug ?? b.slug,
      name: b.name,
      priceUsd: b.priceUsd,
      image: b.image,
      strap: b.strap,
      engraving: b.engraving,
      qty: b.qty,
    });
    if (!outcome.ok)
      return NextResponse.json({ error: outcome.error }, { status: outcome.status });
    return NextResponse.json(outcome.items);
  } catch (e) {
    console.error("POST /api/cart failed:", e);
    return NextResponse.json({ error: "Lỗi thêm vào giỏ" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  try {
    const b = (await req.json()) as { slug?: string; strap?: string; qty?: number };
    const outcome = await updateCartQty(storage, session.id, b);
    if (!outcome.ok)
      return NextResponse.json({ error: outcome.error }, { status: outcome.status });
    return NextResponse.json(outcome.items);
  } catch (e) {
    console.error("PATCH /api/cart failed:", e);
    return NextResponse.json({ error: "Lỗi cập nhật giỏ" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  try {
    const { searchParams } = new URL(req.url);
    const outcome =
      searchParams.get("clear") === "1"
        ? await clearCart(storage, session.id)
        : await removeFromCart(storage, session.id, {
            slug: searchParams.get("slug") ?? undefined,
            strap: searchParams.get("strap") ?? undefined,
          });
    if (!outcome.ok)
      return NextResponse.json({ error: outcome.error }, { status: outcome.status });
    return NextResponse.json(outcome.items);
  } catch (e) {
    console.error("DELETE /api/cart failed:", e);
    return NextResponse.json({ error: "Lỗi xoá giỏ" }, { status: 500 });
  }
}
