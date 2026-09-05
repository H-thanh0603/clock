import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth";
import { mergeGuestCart } from "@/lib/cart";
import { prismaCartStorage as storage } from "@/lib/cartStorage";

/** Gộp giỏ local (khách) vào giỏ DB khi vừa đăng nhập. */
export async function POST(req: Request) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  try {
    const body = (await req.json()) as { items?: unknown };
    const outcome = await mergeGuestCart(storage, session.id, body.items);
    if (!outcome.ok)
      return NextResponse.json({ error: outcome.error }, { status: outcome.status });
    return NextResponse.json(outcome.items);
  } catch (e) {
    console.error("POST /api/cart/merge failed:", e);
    return NextResponse.json({ error: "Lỗi gộp giỏ hàng" }, { status: 500 });
  }
}
